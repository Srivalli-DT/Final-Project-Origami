from app.fold_utils import (
    build_fold,
    face_adjacency,
    fold_to_svg,
    is_boundary_vertex,
    merge_collinear_lines,
    vertex_neighbors_sorted,
)


def test_empty_square_has_one_face():
    f = build_fold([])
    assert len(f["vertices_coords"]) == 4
    assert f["edges_assignment"].count("B") == 4
    assert len(f["faces_vertices"]) == 1


def test_crossing_lines_split_into_four_faces():
    f = build_fold([((0, 0.5), (1, 0.5), "M"), ((0.5, 0), (0.5, 1), "V")])
    assert len(f["faces_vertices"]) == 4
    centre = [i for i, (x, y) in enumerate(f["vertices_coords"]) if abs(x - .5) < 1e-9 and abs(y - .5) < 1e-9]
    assert len(centre) == 1
    assert len(vertex_neighbors_sorted(f, centre[0])) == 4
    assert not is_boundary_vertex(f, centre[0])


def test_snap_merges_close_vertices_and_duplicates_keep_mv():
    f = build_fold([
        ((0, 0.5), (1, 0.5), "F"),
        ((0, 0.5004), (1, 0.5004), "M"),  # within SNAP -> same line
    ])
    mids = [a for (u, v), a in zip(f["edges_vertices"], f["edges_assignment"]) if a != "B"]
    assert mids == ["M"]


def test_face_adjacency_and_lines():
    f = build_fold([((0, 0.5), (1, 0.5), "M"), ((0.5, 0), (0.5, 1), "V")])
    adj = face_adjacency(f)
    assert len(adj) == 4
    lines = merge_collinear_lines(f)
    assert len(lines) == 2
    assert all(len(ln["edges"]) == 2 for ln in lines)


def test_t_junction_is_split():
    f = build_fold([((0, 0.5), (1, 0.5), "M"), ((0.5, 0.5), (0.5, 1), "V")])
    assert len(f["faces_vertices"]) == 3


def test_svg_contains_colours():
    svg = fold_to_svg(build_fold([((0, 0.5), (1, 0.5), "M"), ((0.5, 0), (0.5, 1), "V")]))
    assert svg.startswith("<svg") and "#e53935" in svg and "#1e88e5" in svg
