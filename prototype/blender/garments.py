"""Real Blender garment assets. Z up, front -Y, root origin at collar.

make_garment(kind, color=None, name=None, variant=None) returns an Empty parent.
Shirts reuse the handoff's simulated cloth; jackets have independent tailored
geometry. These are garment-type illustrations, not measured personal products.
Run with bpy Python: python garments.py --library --preview
"""
from pathlib import Path
import importlib.util
import math
import pickle
import sys

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
WORK = HERE.parent / 'scene' / 'work'
ASSETS = HERE.parent / 'scene' / 'assets'
PALETTE = {'white': '#f0eee5', 'blue': '#8daecb', 'navy': '#202f48',
           'cream': '#ded7bc', 'beige': '#bdae8d', 'olive': '#61684c',
           'green': '#58634b', 'brown': '#78634f', 'black': '#292a2b',
           'gray': '#777b7b', 'denim': '#354f6e', 'red': '#974a40'}
_vendor = None


def _load_vendor():
    global _vendor
    if _vendor:
        return _vendor
    previous = sys.modules.get('gsim')
    spec = importlib.util.spec_from_file_location('gsim', HERE / 'vendor' / 'gsim.py')
    sim = importlib.util.module_from_spec(spec)
    sys.modules['gsim'] = sim
    spec.loader.exec_module(sim)
    spec = importlib.util.spec_from_file_location('wearnext_cloth_scene', HERE / 'vendor' / 'gscene.py')
    scene = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(scene)
    if previous is not None:
        sys.modules['gsim'] = previous
    else:
        del sys.modules['gsim']
    scene.HERE = str(WORK)
    _vendor = scene, sim
    return _vendor


def _rgb(color):
    color = PALETTE.get(color, color or '#8daecb')
    if isinstance(color, (tuple, list)):
        return tuple(color[:3])
    return tuple(int(color[i:i + 2], 16) / 255 for i in (1, 3, 5))


def _linear(rgb):
    return tuple(x / 12.92 if x < .04045 else ((x + .055) / 1.055) ** 2.4 for x in rgb)


def _hex(color):
    return '#' + ''.join(f'{round(max(0, min(1, x)) * 255):02x}' for x in _rgb(color))


def material(name, color, roughness=.75, metal=0, knit=False):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*_linear(_rgb(color)), 1)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = mat.diffuse_color
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metal
    if not metal:
        bsdf.inputs['Sheen Weight'].default_value = .3 if knit else .18
        noise = nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = 240 if knit else 420
        noise.inputs['Detail'].default_value = 2
        bump = nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .24 if knit else .12
        bump.inputs['Distance'].default_value = .0014 if knit else .0005
        links.new(noise.outputs['Fac'], bump.inputs['Height'])
        links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return mat


def _link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _root(name, kind):
    root = _link(bpy.data.objects.new(name, None))
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = .05
    root['kind'] = kind
    root['representation'] = 'garment type illustration; not a measured product'
    root['origin'] = 'collar; Z up; front -Y'
    return root


def mesh(name, verts, faces, mat, parent, thickness=0, subsurf=0, bevel=0):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = _link(bpy.data.objects.new(name, data))
    obj.parent = parent
    obj.data.materials.append(mat)
    for polygon in data.polygons:
        polygon.use_smooth = True
    if subsurf:
        modifier = obj.modifiers.new('Soft tailoring', 'SUBSURF')
        modifier.levels = subsurf
        modifier.render_levels = subsurf
    if thickness:
        modifier = obj.modifiers.new('Fabric thickness', 'SOLIDIFY')
        modifier.thickness = thickness
        modifier.offset = 0
    if bevel:
        modifier = obj.modifiers.new('Soft sewn edge', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 3
    return obj


def curve(name, points, radius, mat, parent, cyclic=False):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.resolution_u = 12
    data.bevel_depth = radius
    data.bevel_resolution = 3
    spline = data.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for bp, point in zip(spline.bezier_points, points):
        bp.co = point
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    spline.use_cyclic_u = cyclic
    obj = _link(bpy.data.objects.new(name, data))
    obj.parent = parent
    obj.data.materials.append(mat)
    return obj


def button(name, location, radius, mat, parent):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (radius, .0023, radius)
    obj.parent = parent
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def hanger(root, width=.42, bar=False):
    wood = material('hanger-walnut', '#89684c', .35)
    steel = material('hanger-brushed-steel', '#b2b0a4', .25, metal=.9)
    curve('Wood shoulder hanger', [(-width / 2, .005, -.075), (-.10, .005, -.034), (0, .005, -.007), (.10, .005, -.034), (width / 2, .005, -.075)], .014, wood, root)
    curve('Metal hanger hook', [(0, .005, -.012), (0, .005, .075), (.017, .005, .118), (-.01, .005, .14), (-.028, .005, .117)], .0029, steel, root)
    if bar:
        curve('Trouser hanger bar', [(-width / 2, .005, -.075), (-width / 2, .005, -.17), (width / 2, .005, -.17), (width / 2, .005, -.075)], .0085, wood, root)


def _simulated_shirt(color, name, stripe=False, knit=False):
    scene, sim = _load_vendor()
    # Legacy builder parents every free scene mesh: capture and restore all old
    # scene objects so this factory is safe inside an already constructed room.
    bpy.context.view_layer.update()
    existing = {obj: (obj.parent, obj.matrix_world.copy()) for obj in bpy.context.scene.objects
                if obj.parent is None and obj.type in ('MESH', 'CURVE')}
    key = f'wearnext-{len(bpy.data.materials)}'
    base = _hex(color)
    scene.PRESETS[key] = dict(weave='stripe' if stripe else 'oxford', c1=base, c2='#eeeae2' if stripe else base,
                             s1='#647e9d', s2='#98acc4', pitch=.007)
    root, specs = scene.build_shirt(str(HERE / 'vendor' / 'shirt-3.pkl'), key)
    for obj, (parent, matrix) in existing.items():
        obj.parent = parent
        obj.matrix_world = matrix
    root.name = name
    root['kind'] = 'knit' if knit else 'shirt'
    root['representation'] = 'garment type illustration; simulated cloth'
    root['origin'] = 'collar; Z up; front -Y'
    # Direct texture-to-Principled link is supported by glTF exporters. The
    # original seam-attribute multiply network is Blender-specific.
    for obj in root.children:
        if obj.type != 'MESH':
            continue
        for mat in obj.data.materials:
            if not mat or not mat.name.startswith('cloth-'):
                continue
            mat.diffuse_color = (*_linear(_rgb(color)), 1)
            shader = mat.node_tree.nodes.get('Principled BSDF')
            texture = next((node for node in mat.node_tree.nodes if node.type == 'TEX_IMAGE'), None)
            if texture:
                mat.node_tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    if not knit:
        return root
    cloth = material('cloth-knit-body', color, .89, knit=True)
    rib = material('cloth-knit-rib', color, .9, knit=True)
    for obj in list(root.children):
        if obj.name.startswith(('body', 'cuff-', 'cuff1', 'cuff-1', 'hanger-wood', 'hook')) and not obj.name.startswith('cuff-btn'):
            if obj.type == 'MESH' and not obj.name.startswith('hanger'):
                obj.data.materials.clear()
                obj.data.materials.append(rib if obj.name.startswith('cuff') else cloth)
        else:
            bpy.data.objects.remove(obj, do_unlink=True)
    # A real crew neckline follows the cached cloth opening, replacing the shirt
    # stand, pointed collar, chest pocket, buttons, and placket entirely.
    neck = []
    for index in range(64):
        theta = index * math.tau / 64
        x = specs['aN'] * math.cos(theta)
        front = math.sin(theta) >= 0
        z = (-specs['nF'] if front else -specs['nB']) * math.sin(theta) ** 2
        y = -(specs['bNf'] if front else specs['bNb']) * math.sin(theta)
        neck.append((x, y, z + .002))
    curve('Ribbed crew neck', neck, .009, rib, root, cyclic=True)
    with open(HERE / 'vendor' / 'shirt-3.pkl', 'rb') as handle:
        cached = pickle.load(handle)
    _, _, info = sim.build(specs)
    for side in 'FB':
        rows = info['grid'][side][-5:]
        vertices = [sim.B(cached['pos'][index]) for row in rows for index in row]
        cols = len(rows[0])
        faces = [(j * cols + i, j * cols + i + 1, (j + 1) * cols + i + 1, (j + 1) * cols + i)
                 for j in range(len(rows) - 1) for i in range(cols - 1)]
        band = mesh('Ribbed knit hem ' + side, vertices, faces, rib, root, thickness=.003, subsurf=1)
        band.location.y = -.002 if side == 'F' else .002
    return root


def _jacket_body(root, cloth, field=False):
    rows, cols = 32, 64
    verts, faces = [], []
    for row in range(rows + 1):
        t = row / rows
        width = .257 + .012 * math.sin(math.pi * t) - .017 * math.sin(math.pi * t) ** 2 + .01 * t
        depth = .058 - .008 * t
        opening = (.068 * max(0, 1 - t / .52) + .006) if not field else .003
        gap = math.asin(min(.7, opening / width))
        for col in range(cols + 1):
            angle = gap + (math.tau - 2 * gap) * col / cols
            x = width * math.sin(angle)
            y = -depth * math.cos(angle)
            shoulder = -.06 * max(0, (abs(x) - .075) / (width - .075))
            if abs(x) < .075:
                shoulder = -.045 * max(0, math.cos(angle))
            z = shoulder * (1 - t) - (.76 if not field else .73) * t
            y += .003 * math.sin(t * 24 + angle * 6) * math.sin(math.pi * t)
            verts.append((x, y, z))
    for row in range(rows):
        for col in range(cols):
            a = row * (cols + 1) + col
            faces.append((a, a + 1, a + cols + 2, a + cols + 1))
    mesh('Field jacket body' if field else 'Tailored blazer body', verts, faces, cloth, root, thickness=.006, subsurf=1)
    for side in (-1, 1):
        verts, faces = [], []
        lengthwise, around = 28, 24
        for row in range(lengthwise + 1):
            t = row / lengthwise
            cx = side * (.216 + .028 * t + .01 * math.sin(math.pi * t))
            cy = -.008 - .026 * t
            cz = -.065 - .595 * t
            radius = .078 * (1 - t) + .051 * t
            for col in range(around):
                angle = math.tau * col / around
                radius_here = radius * (1 + .025 * math.sin(t * 35 + angle * 3))
                verts.append((cx + math.cos(angle) * radius_here, cy + math.sin(angle) * radius_here * .69, cz - side * math.cos(angle) * radius_here * (.38 * (1 - t) + .1 * t)))
        faces.append(tuple(reversed(range(around))))
        for row in range(lengthwise):
            for col in range(around):
                a = row * around + col
                faces.append((a, row * around + (col + 1) % around, (row + 1) * around + (col + 1) % around, a + around))
        mesh('Structured jacket sleeve ' + str(side), verts, faces, cloth, root, thickness=.004, subsurf=1)


def _patch(root, name, points, mat, thickness=.004):
    return mesh(name, points, [tuple(range(len(points)))], mat, root, thickness=thickness, bevel=.002)


def _pocket(root, x, z, width, height, mat, button_mat=None, flap=False):
    y = -.067
    _patch(root, 'Applied pocket', [(x - width / 2, y, z), (x + width / 2, y, z),
                                  (x + width / 2, y -.004, z - height + .008), (x + width / 2 - .012, y -.004, z - height),
                                  (x - width / 2 + .012, y -.004, z - height), (x - width / 2, y -.004, z - height + .008)], mat)
    if flap:
        _patch(root, 'Folded pocket flap', [(x - width / 2 - .003, y -.009, z + .004), (x + width / 2 + .003, y -.009, z + .004),
                                           (x + width / 2, y -.012, z - .035), (x, y -.015, z - .044), (x - width / 2, y -.012, z - .035)], mat)
        if button_mat:
            button('Pocket flap snap', (x, y -.019, z - .026), .0055, button_mat, root)


def _blazer(color, name):
    root = _root(name, 'blazer')
    cloth = material('cloth-blazer-wool', color, .77)
    lapel = material('cloth-blazer-lapels', color, .71)
    gold = material('blazer-antique-brass', '#b39a62', .25, .78)
    lining = material('cloth-blazer-inner-lining', '#24262b', .5)
    _jacket_body(root, cloth)
    _patch(root, 'Dark inner facing', [(-.076, -.013, -.025), (.076, -.013, -.025), (.047, -.027, -.42), (-.047, -.027, -.42)], lining)
    for side in (-1, 1):
        # Separate folded notch lapels, rather than shirt collars painted navy.
        _patch(root, 'Notched lapel ' + str(side), [(side * .081, -.053, .002), (side * .13, -.058, -.10),
                (side * .163, -.068, -.123), (side * .126, -.076, -.146), (side * .15, -.073, -.19),
                (side * .018, -.071, -.43), (side * .066, -.059, -.15)], lapel, .007)
        _patch(root, 'Lapel collar fall ' + str(side), [(side * .013, .003, .012), (side * .075, -.026, .01),
                (side * .13, -.057, -.099), (side * .091, -.069, -.12), (side * .052, -.04, -.041)], lapel, .007)
        _pocket(root, side * .158, -.478, .137, .13, cloth, flap=True)
        for index in range(3):
            button('Brass sleeve button', (side * (.268 - index * .009), -.068, -.636 + index * .013), .0048, gold, root)
    _patch(root, 'Welt breast pocket', [(.085, -.072, -.255), (.199, -.063, -.242), (.199, -.065, -.257), (.085, -.074, -.27)], lapel)
    for z in (-.434, -.53):
        button('Brass front blazer button', (-.014, -.073, z), .0085, gold, root)
    hanger(root)
    return root


def _fieldjacket(color, name):
    root = _root(name, 'fieldjacket')
    cloth = material('cloth-fieldjacket-cotton', color, .85)
    detail = material('cloth-fieldjacket-pocket-flaps', color, .8)
    snaps = material('fieldjacket-dark-snaps', '#535449', .4, .6)
    _jacket_body(root, cloth, field=True)
    for side in (-1, 1):
        _pocket(root, side * .14, -.18, .145, .16, detail, snaps, True)
        _pocket(root, side * .15, -.46, .175, .19, detail, snaps, True)
        _patch(root, 'Field folded collar ' + str(side), [(side * .005, -.02, .019), (side * .082, -.018, .012),
                (side * .13, -.064, -.085), (side * .061, -.076, -.117), (side * .031, -.059, -.032)], detail, .007)
        _patch(root, 'Shoulder epaulet ' + str(side), [(side * .106, -.013, -.021), (side * .255, -.018, -.059),
                (side * .25, -.042, -.069), (side * .105, -.04, -.032)], detail)
        button('Epaulet snap', (side * .127, -.043, -.032), .005, snaps, root)
        _patch(root, 'Sleeve cinch strap', [(side * .205, -.069, -.61), (side * .289, -.066, -.616),
                (side * .286, -.066, -.642), (side * .206, -.069, -.638)], detail)
    _patch(root, 'Covered zipper storm placket', [(-.018, -.068, -.04), (.018, -.068, -.04),
                (.019, -.065, -.706), (-.019, -.065, -.706)], detail)
    for z in (-.13, -.26, -.40, -.55, -.68):
        button('Storm placket snap', (0, -.075, z), .0057, snaps, root)
    curve('Waist adjustment seam', [(-.244, -.022, -.399), (-.15, -.059, -.399), (0, -.064, -.399), (.15, -.059, -.399), (.244, -.022, -.399)], .0012, detail, root)
    hanger(root)
    return root


def _trousers(color, name, denim=False):
    root = _root(name, 'denim' if denim else 'trousers')
    cloth = material('cloth-denim-twill' if denim else 'cloth-trouser-twill', color, .88)
    stitch = material('cloth-denim-topstitch' if denim else 'cloth-trouser-seams', '#b99a68' if denim else '#a5997e', .88)
    hanger(root, width=.39, bar=True)
    # Two folded trouser legs wrap over the actual crossbar in a continuous U.
    for side in (-1, 1):
        verts, faces = [], []
        cols, rows = 14, 44
        for row in range(rows + 1):
            t = row / rows
            if t < .44:
                q = t / .44
                y, z = .027, -.68 + .51 * q
            elif t < .56:
                angle = math.pi * (t - .44) / .12
                y, z = .027 * math.cos(angle), -.17 + .027 * math.sin(angle)
            else:
                q = (t - .56) / .44
                y, z = -.027, -.17 - .49 * q
            half = .073 - .009 * max(0, (.5 - t) * 2)
            for col in range(cols + 1):
                u = col / cols
                x = side * .078 + (u * 2 - 1) * half
                wrinkle = .0035 * math.sin(u * math.pi * 5 + t * 12) * math.sin(math.pi * u)
                verts.append((x, y + wrinkle, z + .002 * math.sin(u * 8 + side)))
        for row in range(rows):
            for col in range(cols):
                a = row * (cols + 1) + col
                faces.append((a, a + 1, a + cols + 2, a + cols + 1))
        mesh('Folded denim leg' if denim else 'Folded pressed trouser leg', verts, faces, cloth, root, thickness=.006, subsurf=1)
        x = side * .078
        curve('Trouser stitched outside seam', [(x + side * .07, -.034, -.19), (x + side * .07, -.033, -.4), (x + side * .064, -.034, -.647)], .0008, stitch, root)
        curve('Turned trouser hem', [(x - .066, -.034, -.642), (x, -.036, -.645), (x + .066, -.034, -.643)], .0025, cloth, root)
        if not denim:
            curve('Pressed front crease', [(x, -.032, -.20), (x, -.034, -.39), (x, -.033, -.637)], .0007, cloth, root)
    if denim:
        _pocket(root, -.078, -.36, .102, .125, cloth)
        curve('Denim pocket stitching', [(-.12, -.076, -.37), (-.12, -.077, -.459), (-.078, -.078, -.476), (-.035, -.077, -.459), (-.035, -.076, -.37)], .0008, stitch, root)
    return root


def _folded(kind, color, name):
    """Shelf asset with origin at base centre; no hidden hanger or standing body."""
    root = _root(name, kind)
    root['origin'] = 'folded garment base centre; Z up; front -Y'
    cloth = material('cloth-folded-' + kind, color, .87, knit=kind == 'knit')
    rib = material('cloth-folded-rib-' + kind, color, .9, knit=kind == 'knit')
    trouser = kind in ('trousers', 'denim')
    width, depth = (.245, .38) if trouser else (.33, .37)
    height = .082 if kind == 'knit' else .052 if trouser else .042
    # Rounded sidewall rings with a gently domed top preserve soft textile volume.
    verts, faces = [], []
    segments, rings = 64, 8
    for row in range(rings + 1):
        t = row / rings
        inset = .009 * (abs(2 * t - 1) ** 2)
        z = .004 + (height - .008) * t
        for col in range(segments):
            angle = math.tau * col / segments
            cs, sn = math.cos(angle), math.sin(angle)
            x = math.copysign(abs(cs) ** .28, cs) * (width / 2 - inset)
            y = math.copysign(abs(sn) ** .28, sn) * (depth / 2 - inset)
            verts.append((x, y, z + .0018 * math.sin(angle * 7 + t * 2)))
    for row in range(rings):
        for col in range(segments):
            a, b = row * segments + col, row * segments + (col + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    faces.append(tuple(reversed(range(segments))))
    faces.append(tuple(rings * segments + col for col in range(segments)))
    mesh('Folded soft cloth body', verts, faces, cloth, root, bevel=.003)
    edge = height * .42
    curve('Visible folded cloth layer', [(-width / 2 + .009, -depth / 2 + .007, edge), (0, -depth / 2 + .004, edge - .002),
          (width / 2 - .009, -depth / 2 + .007, edge)], .0015, rib, root)
    if not trouser:
        # The folded tee/knit keeps its visible oval neckline and shoulder seams.
        collar = [(math.cos(a) * .063, -.084 + math.sin(a) * .047, height + .004) for a in [i * math.tau / 48 for i in range(48)]]
        collar_inner = material('cloth-collar-shadow-' + kind, tuple(x * .66 for x in _rgb(color)), .9)
        _patch(root, 'Crew neck recess', [(x, y, z - .003) for x, y, z in collar], collar_inner, .001)
        curve('Folded ribbed crew neckline', collar, .006 if kind == 'knit' else .0035, rib, root, cyclic=True)
        for side in (-1, 1):
            curve('Folded shoulder seam', [(side * .058, -.095, height + .004), (side * .11, -.12, height),
                  (side * .15, -.136, height - .002)], .0012, rib, root)
        curve('Folded hem band', [(-.15, .137, height + .001), (0, .145, height + .003), (.15, .137, height + .001)], .008 if kind == 'knit' else .002, rib, root)
        if kind == 'knit':
            for index in range(28):
                x = -.142 + index * .0105
                curve('Knit hem rib', [(x, .13, height + .005), (x, .151, height + .005)], .0007, rib, root)
    else:
        seam = material('cloth-folded-trouser-stitch', '#ac895f' if kind == 'denim' else color, .87)
        curve('Folded leg inner seam', [(-.009, -.178, height + .001), (-.003, 0, height + .002), (.005, .172, height + .001)], .001, seam, root)
        if kind == 'denim':
            # Pocket on the top folded face, with pentagonal double topstitch.
            pocket = [(-.093, -.038, height + .006), (.017, -.038, height + .006),
                      (.012, .07, height + .006), (-.04, .091, height + .006), (-.089, .07, height + .006)]
            _patch(root, 'Folded denim back pocket', pocket, cloth, .002)
            curve('Denim back pocket topstitch', pocket, .0011, seam, root, cyclic=True)
        else:
            curve('Folded tailored crease', [(.061, -.17, height + .001), (.058, .02, height + .004), (.058, .169, height + .001)], .0008, seam, root)
    return root


def make_garment(kind, color=None, name=None, variant=None):
    """Create one independently parented asset; never clear the current scene."""
    if kind.startswith('folded_'):
        variant, kind = 'folded', kind.removeprefix('folded_')
    aliases = {'jacket': 'blazer', 'field': 'fieldjacket', 'field_jacket': 'fieldjacket',
               'chino': 'trousers', 'trouser': 'trousers', 'jeans': 'denim', 'sweater': 'knit', 'tee': 'tshirt'}
    kind = aliases.get(kind, kind)
    name = name or f'WearNext {kind}'
    defaults = {'shirt': 'white', 'knit': 'cream', 'blazer': 'navy', 'fieldjacket': 'olive', 'trousers': 'beige', 'denim': 'denim', 'tshirt': 'white'}
    color = color or defaults.get(kind, 'white')
    if variant == 'folded' or kind == 'tshirt':
        if kind not in ('shirt', 'knit', 'tshirt', 'trousers', 'denim'):
            raise ValueError(f'Unsupported folded garment kind: {kind}')
        root = _folded(kind, color, name)
    elif kind == 'shirt':
        root = _simulated_shirt(color, name, stripe=variant in ('stripe', 'striped'))
    elif kind == 'knit':
        root = _simulated_shirt(color, name, knit=True)
    elif kind == 'blazer':
        root = _blazer(color, name)
    elif kind == 'fieldjacket':
        root = _fieldjacket(color, name)
    elif kind in ('denim', 'trousers'):
        root = _trousers(color, name, denim=kind == 'denim')
    else:
        raise ValueError(f'Unsupported garment kind: {kind}')
    root['color'] = _hex(color)
    root['variant'] = variant or 'solid'
    for image in bpy.data.images:
        if image.source == 'FILE' and not image.packed_file:
            image.pack()
    return root


def build_library(output=None, preview=None):
    """Standalone .blend library and optional real Cycles PNG; separate from room."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ASSETS.mkdir(parents=True, exist_ok=True)
    specifications = [('shirt', 'white', None), ('shirt', 'blue', 'stripe'), ('knit', 'cream', None),
                      ('blazer', 'navy', None), ('fieldjacket', 'olive', None), ('denim', 'denim', None), ('trousers', 'beige', None)]
    roots = []
    for index, (kind, color, variant) in enumerate(specifications):
        print(f'Building {index + 1}/{len(specifications)} {kind}', flush=True)
        root = make_garment(kind, color, f'{index + 1:02d} {kind}', variant)
        root.location.x = index * .86
        root.asset_mark()
        roots.append(root)
    for index, (kind, color) in enumerate([('trousers', 'beige'), ('denim', 'denim'), ('knit', 'cream'), ('tshirt', 'white')]):
        root = make_garment(kind, color, f'Folded {kind}', variant='folded')
        root.location = (.82 + index * 1.17, -.43, -.832)
        root.asset_mark()
        roots.append(root)
    if preview:
        ground = material('Preview warm plaster', '#e7e2d7', .85)
        mesh('Preview floor', [(-2, -3, -.84), (8, -3, -.84), (8, 3, -.84), (-2, 3, -.84)], [(0, 1, 2, 3)], ground, None)
        scene = bpy.context.scene
        scene.render.engine = 'CYCLES'
        scene.cycles.samples = 24
        scene.cycles.use_denoising = True
        scene.render.threads_mode = 'FIXED'
        scene.render.threads = 8
        scene.render.resolution_x, scene.render.resolution_y = 2100, 720
        scene.render.resolution_percentage = 100
        world = bpy.data.worlds.new('Warm studio')
        world.use_nodes = True
        world.node_tree.nodes['Background'].inputs['Color'].default_value = (.75, .77, .82, 1)
        world.node_tree.nodes['Background'].inputs['Strength'].default_value = .45
        scene.world = world
        for name, loc, energy, size in [('Large softbox', (1, -3, 4), 1000, 6), ('Warm fill', (5, -1, 2), 400, 4)]:
            data = bpy.data.lights.new(name, 'AREA')
            data.energy, data.shape, data.size = energy, 'DISK', size
            obj = _link(bpy.data.objects.new(name, data))
            obj.location = loc
            obj.rotation_euler = (Vector((2.6, 0, -.3)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
        data = bpy.data.cameras.new('Garment asset camera')
        obj = _link(bpy.data.objects.new('Garment asset camera', data))
        obj.location = (2.55, -6, 1.15)
        obj.rotation_euler = (Vector((2.55, 0, -.34)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
        data.type, data.ortho_scale = 'ORTHO', 6.25
        scene.camera = obj
        scene.render.filepath = str(preview)
        bpy.ops.wm.save_as_mainfile(filepath=str(output or ASSETS / 'garments.blend'))
        bpy.ops.render.render(write_still=True)
    else:
        bpy.ops.wm.save_as_mainfile(filepath=str(output or ASSETS / 'garments.blend'))
    return roots


if __name__ == '__main__':
    build_library(preview=ASSETS / 'garment-preview.png' if '--preview' in sys.argv else None)
