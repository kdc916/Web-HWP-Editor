use rhwp::model::control::Control;
use rhwp::model::table::Table;
use rhwp::wasm_api::HwpDocument;
use serde_json::Value;

fn table_para_idx(created: &str) -> usize {
    let parsed: Value = serde_json::from_str(created).expect("create table json");
    parsed["paraIdx"].as_u64().expect("paraIdx") as usize
}

fn table<'a>(doc: &'a HwpDocument, para_idx: usize) -> &'a Table {
    doc.document().sections[0].paragraphs[para_idx]
        .controls
        .iter()
        .find_map(|control| match control {
            Control::Table(table) => Some(table.as_ref()),
            _ => None,
        })
        .expect("table control")
}

fn first_table_para(doc: &HwpDocument) -> usize {
    doc.document().sections[0]
        .paragraphs
        .iter()
        .position(|para| para.controls.iter().any(|c| matches!(c, Control::Table(_))))
        .expect("first table para")
}

fn table_control_idx(doc: &HwpDocument, para_idx: usize) -> usize {
    doc.document().sections[0].paragraphs[para_idx]
        .controls
        .iter()
        .position(|control| matches!(control, Control::Table(_)))
        .expect("table control index")
}

fn cell_index(doc: &HwpDocument, para_idx: usize, row: u16, col: u16) -> usize {
    table(doc, para_idx)
        .cells
        .iter()
        .enumerate()
        .find(|(_, cell)| cell.row == row && cell.col == col)
        .map(|(idx, _)| idx)
        .unwrap_or_else(|| panic!("cell ({row},{col})"))
}

fn row_heights(table: &Table) -> Vec<u32> {
    let mut values = vec![0_u32; table.row_count as usize];
    for cell in &table.cells {
        if cell.row_span == 1 {
            values[cell.row as usize] = values[cell.row as usize].max(cell.height);
        }
    }
    values
}

fn col_widths(table: &Table) -> Vec<u32> {
    let mut values = vec![0_u32; table.col_count as usize];
    for cell in &table.cells {
        if cell.col_span == 1 {
            values[cell.col as usize] = values[cell.col as usize].max(cell.width);
        }
    }
    values
}

fn assert_exact_grid(table: &Table) {
    for row in 0..table.row_count {
        for col in 0..table.col_count {
            let covering = table
                .cells
                .iter()
                .filter(|cell| {
                    row >= cell.row
                        && row < cell.row.saturating_add(cell.row_span)
                        && col >= cell.col
                        && col < cell.col.saturating_add(cell.col_span)
                })
                .count();
            assert_eq!(
                covering, 1,
                "grid ({row},{col}) must be covered exactly once; cells={:?}",
                table
                    .cells
                    .iter()
                    .map(|c| (c.row, c.col, c.row_span, c.col_span, c.width, c.height))
                    .collect::<Vec<_>>()
            );
        }
    }
}

fn distribute(total: u32, count: usize) -> Vec<u32> {
    let base = total / count as u32;
    let mut remainder = total % count as u32;
    (0..count)
        .map(|_| {
            let value = base + u32::from(remainder > 0);
            remainder = remainder.saturating_sub(1);
            value
        })
        .collect()
}

fn equalize_rows_persisted(doc: &mut HwpDocument, para_idx: usize, start: usize, end: usize) {
    let (units, cells) = {
        let t = table(doc, para_idx);
        let units = row_heights(t);
        let cells = t
            .cells
            .iter()
            .enumerate()
            .map(|(idx, c)| (idx, c.row as usize, c.row_span as usize, c.height))
            .collect::<Vec<_>>();
        (units, cells)
    };
    assert!(units.iter().all(|v| *v > 0), "row units must be persisted: {units:?}");
    let mut target = units.clone();
    let equal = distribute(units[start..=end].iter().sum(), end - start + 1);
    target[start..=end].copy_from_slice(&equal);

    let updates = cells
        .into_iter()
        .filter_map(|(idx, row, span, current)| {
            let desired: u32 = target[row..(row + span).min(target.len())].iter().sum();
            let delta = desired as i64 - current as i64;
            (delta != 0).then(|| format!(r#"{{"cellIdx":{idx},"heightDelta":{delta}}}"#))
        })
        .collect::<Vec<_>>()
        .join(",");

    if !updates.is_empty() {
        doc.resize_table_cells(0, para_idx as u32, 0, &format!("[{updates}]"))
            .expect("persisted row equalization");
    }
}

fn equalize_cols_persisted(doc: &mut HwpDocument, para_idx: usize, start: usize, end: usize) {
    let (units, cells) = {
        let t = table(doc, para_idx);
        let units = col_widths(t);
        let cells = t
            .cells
            .iter()
            .enumerate()
            .map(|(idx, c)| (idx, c.col as usize, c.col_span as usize, c.width))
            .collect::<Vec<_>>();
        (units, cells)
    };
    assert!(units.iter().all(|v| *v > 0), "column units must be persisted: {units:?}");
    let mut target = units.clone();
    let equal = distribute(units[start..=end].iter().sum(), end - start + 1);
    target[start..=end].copy_from_slice(&equal);

    let updates = cells
        .into_iter()
        .filter_map(|(idx, col, span, current)| {
            let desired: u32 = target[col..(col + span).min(target.len())].iter().sum();
            let delta = desired as i64 - current as i64;
            (delta != 0).then(|| format!(r#"{{"cellIdx":{idx},"widthDelta":{delta}}}"#))
        })
        .collect::<Vec<_>>()
        .join(",");

    if !updates.is_empty() {
        doc.resize_table_cells(0, para_idx as u32, 0, &format!("[{updates}]"))
            .expect("persisted column equalization");
    }
}

#[test]
fn row_equalize_vertical_merge_split_and_hwp_roundtrip_keep_one_grid() {
    let mut doc = HwpDocument::create_empty();
    let created = doc.create_table_native(0, 0, 0, 3, 3).expect("3x3 table");
    let para_idx = table_para_idx(&created);

    // Make rows deliberately uneven.
    let mut updates = Vec::new();
    for row in 0..3_u16 {
        let delta = 500_i32 * (row as i32 + 1);
        for col in 0..3_u16 {
            let idx = cell_index(&doc, para_idx, row, col);
            updates.push(format!(r#"{{"cellIdx":{idx},"heightDelta":{delta}}}"#));
        }
    }
    doc.resize_table_cells(0, para_idx as u32, 0, &format!("[{}]", updates.join(",")))
        .expect("uneven rows");

    equalize_rows_persisted(&mut doc, para_idx, 0, 2);
    let equal = row_heights(table(&doc, para_idx));
    assert!(
        equal.windows(2).all(|pair| pair[0].abs_diff(pair[1]) <= 1),
        "rows should be equal before merge: {equal:?}"
    );

    // User reproduction: right-side three cells are vertically merged.
    doc.merge_table_cells_native(0, para_idx, 0, 0, 2, 2, 2)
        .expect("vertical merge");
    let t = table(&doc, para_idx);
    assert_exact_grid(t);

    let merged_idx = cell_index(&doc, para_idx, 0, 2);
    let expected: u32 = row_heights(t).iter().sum();
    assert_eq!(t.cells[merged_idx].height, expected, "merged height must equal row-grid sum");

    // Real HWP round-trip must preserve the same geometry.
    let bytes = doc.export_hwp_native().expect("export hwp");
    let mut reopened = HwpDocument::from_bytes(&bytes).expect("reopen hwp");
    let para2 = first_table_para(&reopened);
    assert_exact_grid(table(&reopened, para2));

    let merged2 = cell_index(&reopened, para2, 0, 2);
    let expected2: u32 = row_heights(table(&reopened, para2)).iter().sum();
    assert_eq!(
        table(&reopened, para2).cells[merged2].height,
        expected2,
        "round-trip merged height must equal row-grid sum"
    );

    let ctrl2 = table_control_idx(&reopened, para2);
    reopened
        .split_table_cell_native(0, para2, ctrl2, 0, 2)
        .expect("split merged cell");
    assert_exact_grid(table(&reopened, para2));

    let rows = row_heights(table(&reopened, para2));
    for row in 0..3_u16 {
        for col in 0..3_u16 {
            let idx = cell_index(&reopened, para2, row, col);
            assert_eq!(
                table(&reopened, para2).cells[idx].height,
                rows[row as usize],
                "split cell must return to canonical row height at ({row},{col})"
            );
        }
    }
}

#[test]
fn column_equalize_horizontal_merge_split_and_hwp_roundtrip_keep_one_grid() {
    let mut doc = HwpDocument::create_empty();
    let created = doc.create_table_native(0, 0, 0, 3, 3).expect("3x3 table");
    let para_idx = table_para_idx(&created);

    let mut updates = Vec::new();
    for col in 0..3_u16 {
        let delta = 600_i32 * (col as i32 + 1);
        for row in 0..3_u16 {
            let idx = cell_index(&doc, para_idx, row, col);
            updates.push(format!(r#"{{"cellIdx":{idx},"widthDelta":{delta}}}"#));
        }
    }
    doc.resize_table_cells(0, para_idx as u32, 0, &format!("[{}]", updates.join(",")))
        .expect("uneven columns");

    equalize_cols_persisted(&mut doc, para_idx, 0, 2);
    let equal = col_widths(table(&doc, para_idx));
    assert!(
        equal.windows(2).all(|pair| pair[0].abs_diff(pair[1]) <= 1),
        "columns should be equal before merge: {equal:?}"
    );

    doc.merge_table_cells_native(0, para_idx, 0, 1, 0, 1, 2)
        .expect("horizontal merge");
    let t = table(&doc, para_idx);
    assert_exact_grid(t);

    let merged_idx = cell_index(&doc, para_idx, 1, 0);
    let expected: u32 = col_widths(t).iter().sum();
    assert_eq!(t.cells[merged_idx].width, expected, "merged width must equal column-grid sum");

    let bytes = doc.export_hwp_native().expect("export hwp");
    let mut reopened = HwpDocument::from_bytes(&bytes).expect("reopen hwp");
    let para2 = first_table_para(&reopened);
    assert_exact_grid(table(&reopened, para2));

    let merged2 = cell_index(&reopened, para2, 1, 0);
    let expected2: u32 = col_widths(table(&reopened, para2)).iter().sum();
    assert_eq!(
        table(&reopened, para2).cells[merged2].width,
        expected2,
        "round-trip merged width must equal column-grid sum"
    );

    let ctrl2 = table_control_idx(&reopened, para2);
    reopened
        .split_table_cell_native(0, para2, ctrl2, 1, 0)
        .expect("split merged cell");
    assert_exact_grid(table(&reopened, para2));

    let cols = col_widths(table(&reopened, para2));
    for row in 0..3_u16 {
        for col in 0..3_u16 {
            let idx = cell_index(&reopened, para2, row, col);
            assert_eq!(
                table(&reopened, para2).cells[idx].width,
                cols[col as usize],
                "split cell must return to canonical column width at ({row},{col})"
            );
        }
    }
}

#[test]
fn merge_split_insert_delete_preserve_exact_table_grid() {
    let mut doc = HwpDocument::create_empty();
    let created = doc.create_table_native(0, 0, 0, 3, 3).expect("3x3 table");
    let para_idx = table_para_idx(&created);
    assert_exact_grid(table(&doc, para_idx));

    doc.merge_table_cells_native(0, para_idx, 0, 0, 1, 2, 1)
        .expect("merge vertical block");
    assert_exact_grid(table(&doc, para_idx));

    doc.split_table_cell_native(0, para_idx, 0, 0, 1)
        .expect("split vertical block");
    assert_exact_grid(table(&doc, para_idx));

    doc.insert_table_row_native(0, para_idx, 0, 1, true)
        .expect("insert row");
    assert_exact_grid(table(&doc, para_idx));

    doc.insert_table_column_native(0, para_idx, 0, 1, true)
        .expect("insert column");
    assert_exact_grid(table(&doc, para_idx));

    doc.delete_table_row_native(0, para_idx, 0, 0)
        .expect("delete row");
    assert_exact_grid(table(&doc, para_idx));

    doc.delete_table_column_native(0, para_idx, 0, 0)
        .expect("delete column");
    assert_exact_grid(table(&doc, para_idx));

    let bytes = doc.export_hwp_native().expect("export final hwp");
    let reopened = HwpDocument::from_bytes(&bytes).expect("reopen final hwp");
    assert_exact_grid(table(&reopened, first_table_para(&reopened)));
}
