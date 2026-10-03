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
    let mut heights = vec![0_u32; table.row_count as usize];
    for cell in &table.cells {
        if cell.row_span == 1 {
            heights[cell.row as usize] = heights[cell.row as usize].max(cell.height);
        }
    }
    heights
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

fn equalize_rows_persisted(doc: &mut HwpDocument, para_idx: usize) {
    let (rows, cell_snapshot) = {
        let t = table(doc, para_idx);
        let rows = row_heights(t);
        let cells = t
            .cells
            .iter()
            .enumerate()
            .map(|(idx, c)| (idx, c.row, c.row_span, c.height))
            .collect::<Vec<_>>();
        (rows, cells)
    };
    assert!(rows.iter().all(|h| *h > 0), "all rows need persisted heights: {rows:?}");
    let total: u32 = rows.iter().sum();
    let count = rows.len() as u32;
    let base = total / count;
    let mut rem = total % count;
    let target_rows = (0..rows.len())
        .map(|_| {
            let v = base + u32::from(rem > 0);
            rem = rem.saturating_sub(1);
            v
        })
        .collect::<Vec<_>>();

    let updates = cell_snapshot
        .into_iter()
        .filter_map(|(idx, row, span, current)| {
            let end = (row as usize + span as usize).min(target_rows.len());
            let desired: u32 = target_rows[row as usize..end].iter().sum();
            let delta = desired as i64 - current as i64;
            (delta != 0).then(|| format!(r#"{{"cellIdx":{idx},"heightDelta":{delta}}}"#))
        })
        .collect::<Vec<_>>()
        .join(",");

    if !updates.is_empty() {
        doc.resize_table_cells(0, para_idx as u32, 0, &format!("[{updates}]"))
            .expect("persisted whole-table row equalize");
    }
}

#[test]
fn three_rows_equalize_then_vertical_merge_preserves_persisted_grid_and_roundtrips() {
    let mut doc = HwpDocument::create_empty();
    let created = doc.create_table_native(0, 0, 0, 3, 2).expect("3x2 table");
    let para_idx = table_para_idx(&created);

    // Deliberately make the three rows different while keeping every cell
    // in the same row aligned.
    let mut updates = Vec::new();
    for row in 0..3_u16 {
        let delta = 400_i32 * (row as i32 + 1);
        for col in 0..2_u16 {
            let idx = cell_index(&doc, para_idx, row, col);
            updates.push(format!(r#"{{"cellIdx":{idx},"heightDelta":{delta}}}"#));
        }
    }
    doc.resize_table_cells(0, para_idx as u32, 0, &format!("[{}]", updates.join(",")))
        .expect("make rows uneven");

    equalize_rows_persisted(&mut doc, para_idx);
    let equal = row_heights(table(&doc, para_idx));
    assert!(
        equal.windows(2).all(|pair| pair[0].abs_diff(pair[1]) <= 1),
        "rows should be equal before merge: {equal:?}"
    );

    doc.merge_table_cells_native(0, para_idx, 0, 0, 1, 2, 1)
        .expect("merge right column vertically");

    let t = table(&doc, para_idx);
    assert_exact_grid(t);
    let merged_idx = cell_index(&doc, para_idx, 0, 1);
    let merged = &t.cells[merged_idx];
    let rows = row_heights(t);
    let expected_height: u32 = rows.iter().sum();
    assert_eq!(
        merged.height, expected_height,
        "merged persisted height must equal the sum of its row grid"
    );

    // Round-trip is part of the contract: the fix must survive an actual HWP save.
    let bytes = doc.export_hwp_native().expect("export hwp");
    let mut reopened = HwpDocument::from_bytes(&bytes).expect("reopen exported hwp");
    let para2 = first_table_para(&reopened);
    let reopened_table = table(&reopened, para2);
    assert_exact_grid(reopened_table);
    let right = cell_index(&reopened, para2, 0, 1);
    let reopened_rows = row_heights(reopened_table);
    let reopened_expected_height: u32 = reopened_rows.iter().sum();
    assert_eq!(
        reopened_table.cells[right].height,
        reopened_expected_height,
        "roundtrip merged persisted height must still equal the sum of its row grid"
    );

    let ctrl2 = table_control_idx(&reopened, para2);
    reopened
        .split_table_cell_native(0, para2, ctrl2, 0, 1)
        .expect("split merged cell");
    assert_exact_grid(table(&reopened, para2));

    let split_table = table(&reopened, para2);
    let split_rows = row_heights(split_table);
    for row in 0..3_u16 {
        let li = cell_index(&reopened, para2, row, 0);
        let ri = cell_index(&reopened, para2, row, 1);
        let left = &split_table.cells[li];
        let right = &split_table.cells[ri];
        let expected = split_rows[row as usize];
        assert_eq!(
            left.height, expected,
            "left cell row {row} must use the canonical persisted row height"
        );
        assert_eq!(
            right.height, expected,
            "split right cell row {row} must return to the canonical persisted row height"
        );
    }
}

#[test]
fn merge_split_insert_delete_preserve_exact_table_grid() {
    let mut doc = HwpDocument::create_empty();
    let created = doc.create_table_native(0, 0, 0, 3, 3).expect("3x3 table");
    let para_idx = table_para_idx(&created);
    assert_exact_grid(table(&doc, para_idx));

    doc.merge_table_cells_native(0, para_idx, 0, 0, 2, 2, 2)
        .expect("merge right column");
    assert_exact_grid(table(&doc, para_idx));

    doc.split_table_cell_native(0, para_idx, 0, 0, 2)
        .expect("split right column");
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
}
