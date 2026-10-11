"""Build the original WearNext oak dressing room and portable Blender/GLB assets.

Run with the project's bpy interpreter: python wardrobe.py --draft or --final.
No personal photographs or external model assets are used.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import sys
import time

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector
import numpy as np
from PIL import Image, ImageFilter

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / 'scene' / 'assets'
OUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(HERE))
from garments import make_garment

P = argparse.ArgumentParser()
P.add_argument('--draft', action='store_true')
P.add_argument('--final', action='store_true')
P.add_argument('--skip-render', action='store_true')
ARGS, _ = P.parse_known_args()
DRAFT = not ARGS.final
START = time.monotonic()

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.name != 'Collection' and not collection.objects:
        bpy.data.collections.remove(collection)

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.render.threads_mode = 'FIXED'
scene.render.threads = 4
scene.cycles.samples = 24 if DRAFT else 64
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 8
scene.cycles.diffuse_bounces = 4
scene.cycles.glossy_bounces = 4
scene.render.resolution_x = 960 if DRAFT else 1600
scene.render.resolution_y = 640 if DRAFT else 1050
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = -.15
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.72, .77, .84, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .25

def material(name, color, roughness=.6, metallic=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = roughness
    bs.inputs['Metallic'].default_value = metallic
    m.diffuse_color = (*color, 1)
    return m

def grain_image(name, base, seed, strength=1):
    """A generated, portable oak texture with elongated growth grain."""
    size = 1024
    rng = np.random.default_rng(seed)
    x = np.linspace(0, 1, size)[None, :]
    y = np.linspace(0, 1, size)[:, None]
    broad = (np.sin(x * 45 + np.sin(y * 6.2) * .4)
             + .42*np.sin(x * 120 + np.sin(y * 11) * .7)
             + .15*np.sin(x * 450 + np.sin(y * 4) * 2))
    pores = np.sin(x*1800 + np.sin(y*21)*3) * .7
    annual = np.maximum(0, np.sin(x*66 + np.sin(y*4)*1.8)) ** 14
    noise = rng.normal(0, 1.1, (size, size))
    luminance = strength * (broad*4 + pores - annual*7 + noise)
    pixels = np.clip(np.array(base)[None, None, :] + luminance[:, :, None], 0, 255).astype(np.uint8)
    target = OUT / f'{name}.png'
    Image.fromarray(pixels).save(target, optimize=True)
    image = bpy.data.images.load(str(target), check_existing=False)
    image.name = name
    image.pack()
    return image

def textured_material(name, image, roughness=.55):
    m = material(name, (.55, .4, .24), roughness)
    tex = m.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = image
    tex.extension = 'REPEAT'
    m.node_tree.links.new(tex.outputs['Color'], m.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    return m

oak = textured_material('Warm quarter-sawn oak', grain_image('oak-grain', (178, 148, 111), 84, .78))
smoked = textured_material('Smoked oak interior', grain_image('smoked-oak-grain', (99, 82, 64), 47, .72), .7)
pale_wood = textured_material('Pale oak floor', grain_image('floor-grain', (190, 177, 154), 124, .58), .74)
wall = material('Warm limestone plaster', (.72,.69,.63), .94)
ceiling_mat = material('Soft ivory paint', (.8,.78,.73), .91)
brass = material('Brushed champagne brass', (.54,.37,.17), .28, .75)
dark_bronze = material('Aged bronze', (.13,.105,.07), .38, .65)
linen = material('Natural unbleached linen', (.62,.59,.51), .95)
rug_mat = material('Oatmeal flatwoven wool', (.47,.43,.36), .98)
book_light = material('Book paper / limestone', (.77,.75,.68), .88)
book_dark = material('Dark brown book cloth', (.14,.11,.08), .9)
ceramic = material('Handmade off-white ceramic', (.64,.62,.56), .3)
leaf_mat = material('Matte olive foliage', (.18,.24,.12), .78)
led = material('Warm integrated light diffuser', (.92,.75,.49), .45)
led_bs = led.node_tree.nodes['Principled BSDF']
led_bs.inputs['Emission Color'].default_value = (1,.69,.37,1)
led_bs.inputs['Emission Strength'].default_value = 1.8

room_root = bpy.data.objects.new('room_architecture', None)
scene.collection.objects.link(room_root)
room_root['assetType'] = 'Blender-authored dressing room'
static_meshes = []

def world_uv(obj, scale=1):
    if obj.type != 'MESH': return
    mesh = obj.data
    uv = mesh.uv_layers.active or mesh.uv_layers.new(name='UVMap')
    for p in mesh.polygons:
        axis = max(range(3), key=lambda i: abs(p.normal[i]))
        for loop_index in p.loop_indices:
            co = obj.matrix_world @ mesh.vertices[mesh.loops[loop_index].vertex_index].co
            a, b = (co.x, co.y) if axis == 2 else (co.y, co.z) if axis == 0 else (co.x, co.z)
            uv.data[loop_index].uv = (a*scale, b*scale)

def finish(obj, name, mat, bevel=0, parent=room_root):
    obj.name = name
    if mat: obj.data.materials.append(mat)
    if parent: obj.parent = parent
    if bevel:
        mod = obj.modifiers.new('Softly eased joinery edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        mod.affect = 'EDGES'
        mod2 = obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
        mod2.keep_sharp = True
    if obj.type == 'MESH':
        world_uv(obj, .78)
        for p in obj.data.polygons: p.use_smooth = True
        static_meshes.append(obj)
    return obj

def box(name, pos, size, mat, bevel=.006):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    o = bpy.context.object
    o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, name, mat, bevel)

def cylinder(name, pos, radius, depth, mat, rotation=(0,0,0), vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=pos, rotation=rotation)
    return finish(bpy.context.object, name, mat, .002)

def area(name, location, target, power, color, shape='DISK', size=3, size_y=None):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = power
    data.color = color
    data.shape = shape
    data.size = size
    if size_y is not None: data.size_y = size_y
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    return obj

# Spacious, quiet architecture. All visible joinery is real beveled geometry.
box('Back plaster wall', (0,.43,1.75), (9,.16,3.5), wall, .005)
box('Left return wall', (-4.05,-1.4,1.75), (.15,4,3.5), wall, .005)
box('Right return wall', (4.05,-1.4,1.75), (.15,4,3.5), wall, .005)
box('Ceiling plane', (0,-1.4,3.5), (8.2,4,.08), ceiling_mat, 0)
box('Floor continuous base', (0,-1.9,-.06), (8.4,5.3,.11), pale_wood, 0)
for n in range(34):
    x = -4.05+n*.245
    box(f'Floor plank {n:02d}', (x,-1.85,-.002), (.242,5.2,.009), pale_wood, .0007)
box('Back wall skirting', (0,.31,.062), (8,.028,.12), ceiling_mat, .002)

# Three equal-width bays; open front, no glazing hiding the clothes.
box('Cabinet shadow plinth', (0,-.055,.072), (4.57,.69,.144), smoked, .005)
box('Cabinet bottom', (0,-.075,.18), (4.64,.79,.076), oak, .008)
box('Cabinet crown', (0,-.075,2.855), (4.68,.8,.10), oak, .009)
for n,x in enumerate([-2.29,-.775,.775,2.29]):
    box(f'Oak upright {n}', (x,-.065,1.52), (.07,.77,2.63), oak, .008)
    box(f'Front stile {n}', (x,-.46,1.52), (.083,.042,2.64), oak, .005)
for n,(center,width) in enumerate([(-1.5325,1.445),(0,1.48),(1.5325,1.445)]):
    box(f'Smoked back {n}', (center,.295,1.52), (width,.042,2.63), smoked, .002)
    for j in range(5):
        box(f'Back panel reveal {n}-{j}', (center-width/2+(j+1)*width/6,.270,1.53), (.006,.004,2.6), dark_bronze, 0)
    box(f'Top interior shelf {n}', (center,-.065,2.66), (width,.70,.04), oak, .005)
    box(f'LED upper diffuser {n}', (center,-.36,2.633), (width-.13,.018,.014), led, .002)
    area(f'Warm integrated upper light {n}', (center,-.29,2.61), (center,.08,1.3), 21, (1,.76,.49), 'RECTANGLE', width-.16,.11)

# Hanging sections and drawer fronts.
for bay, center in enumerate([-1.5325,0]):
    cylinder(f'Brass hanging rail {bay}', (center,-.245,2.5), .014, 1.43, brass, (0,math.pi/2,0))
    for side in [-1,1]:
        cylinder(f'Rail socket {bay}-{side}', (center+side*.704,-.245,2.5), .027,.020, brass,(0,math.pi/2,0))
    box(f'Drawer top slab {bay}', (center,-.078,1.03), (1.44,.73,.05), oak,.008)
    box(f'Drawer carcass {bay}', (center,-.04,.62), (1.42,.62,.77), smoked,.006)
    for drawer,z in enumerate([.427,.8]):
        box(f'Inset drawer face {bay}-{drawer}', (center,-.421,z), (1.405,.05,.349), oak,.007)
        cylinder(f'Fine brass drawer pull {bay}-{drawer}', (center,-.467,z+.095), .009,.22, brass,(0,math.pi/2,0),24)
        for side in [-1,1]:
            cylinder(f'Drawer pull stand {bay}-{drawer}-{side}', (center+side*.091,-.447,z+.095), .007,.032,brass,(math.pi/2,0,0),16)

# Folded clothing shelves in the right bay, open lower shoe cubby.
for index,z in enumerate([.64,1.10,1.57,2.04]):
    box(f'Right floating shelf {index}', (1.5325,-.075,z), (1.435,.715,.038),oak,.006)
    box(f'Right shelf LED {index}',(1.5325,-.348,z-.025),(1.28,.014,.012),led,.001)
    if index in [1,3]: area(f'Right shelf glow {index}',(1.5325,-.28,z-.04),(1.5325,-.02,z-.42),7,(1,.77,.50),'RECTANGLE',1.1,.065)

# Low textile bench, slender oak base and woven rug, not obstructing shoe cubby.
box('Flatwoven rug base',(-.25,-1.25,.009),(4.55,2.2,.016),rug_mat,.055)
for i in range(56):
    # Low-contrast strands are geometry rather than a flat colored carpet.
    x=-2.44+i*.079
    box(f'Rug woven line {i}',(x,-1.26,.018),(.006,2.07,.0012),linen,0)
box('Bench solid oak seat base',(-.44,-1.32,.39),(1.56,.58,.065),oak,.023)
box('Bench linen cushion',(-.44,-1.32,.49),(1.56,.59,.16),linen,.070)
for x in [-1.07,.19]:
    for y in [-1.51,-1.13]:
        cylinder('Bench oak leg',(x,y,.198),.032,.36,oak,vertices=24)
box('Bench stretcher',(-.44,-1.32,.19),(1.25,.026,.032),oak,.006)

# An arched leaning mirror to the side catches the soft window illumination.
def arch_points(width, height, steps=36, inset=0):
    r=width/2-inset
    points=[(-r,inset),(r,inset),(r,height-width/2)]
    for i in range(1,steps+1):
        angle=i/steps*math.pi
        points.append((math.cos(angle)*r,height-width/2+math.sin(angle)*r))
    return points

outer=arch_points(.79,2.25)
inner=arch_points(.79,2.25,inset=.028)
n=len(outer)
verts=[(x,-.018,z) for x,z in outer]+[(x,-.033,z) for x,z in inner]
faces=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
mesh=bpy.data.meshes.new('Arched mirror frame mesh')
mesh.from_pydata(verts,[],faces);mesh.update()
frame=bpy.data.objects.new('Arched oak mirror frame',mesh);scene.collection.objects.link(frame)
finish(frame,frame.name,oak,.007)
mirror_mat=material('Polished silver mirror',(.85,.88,.89),.025,1)
mesh=bpy.data.meshes.new('Mirror reflective insert')
mesh.from_pydata([(x,-.031,z) for x,z in inner],[],[tuple(range(n))]);mesh.update()
mirror=bpy.data.objects.new('Full length mirror',mesh);scene.collection.objects.link(mirror)
finish(mirror,mirror.name,mirror_mat)
for obj in [frame,mirror]:
    obj.location=(-2.98,-.05,.035)
    obj.rotation_euler=(math.radians(-6),0,math.radians(-6))

# A small, quiet still life beside the cabinet.
cylinder('Ceramic plant pot',(2.93,-.08,.255),.23,.50,ceramic,vertices=48)
soil=material('Potting soil',(.075,.057,.035),1)
cylinder('Plant soil',(2.93,-.08,.502),.215,.009,soil,vertices=32)
for i,(dx,dy,h) in enumerate([(-.13,0,1.08),(.10,.04,1.35),(.01,-.11,1.0),(.17,-.035,.85)]):
    stem=cylinder(f'Plant stem {i}',(2.93+dx*.45,-.08+dy*.45,.49+h*.5),.007,h,dark_bronze,vertices=10)
    stem.rotation_euler=(dy*.5,-dx*.4,0)
    for j in range(4):
        z=.65+h*(j+1)/5
        angle=j*2.2+i
        pos=(2.93+dx*.7+math.cos(angle)*.15,-.08+dy*.7+math.sin(angle)*.12,z)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1,location=pos)
        leaf=bpy.context.object;leaf.scale=(.14,.046,.018)
        leaf.rotation_euler=(.2,(-1 if j%2 else 1)*.4,angle)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        finish(leaf,f'Olive leaf {i}-{j}',leaf_mat)

for i in range(3):
    book=box(f'Quiet shelf book {i}',(1.96,-.05,2.70+i*.033),(.30,.32,.026),book_dark if i==1 else book_light,.003)
    book.rotation_euler.z=math.radians(i*3-2)

# Clothing groups are separate roots for interaction in Three.js.
slot_specs=[
    ('slot_01','shirt','white',(-1.90,-.25,2.355),1.02,'top',['shirt'],None),
    ('slot_02','shirt','blue',(-1.19,-.25,2.355),1.02,'top',['shirt'],None),
    ('slot_03','blazer','navy',(-.355,-.25,2.36),1.0,'outer',['blazer','jacket'],None),
    ('slot_04','fieldjacket','olive',(.355,-.25,2.36),1.0,'outer',['fieldjacket','chore','jacket'],None),
    ('slot_05','chino','beige',(1.50,-.16,2.064),1.25,'bottom',['chino','trouser'],'folded'),
    ('slot_06','denim','navy',(1.50,-.16,1.594),1.25,'bottom',['denim'],'folded'),
    ('slot_07','knit','cream',(1.50,-.16,1.124),1.20,'top',['knit'],'folded'),
    ('slot_08','tshirt','white',(1.50,-.16,.664),1.20,'top',['tshirt','tee'],'folded'),
    ('slot_09','loafer','brown',(1.14,-.17,.225),.90,'shoes',['loafer'],None),
    ('slot_10','sneaker','white',(1.89,-.17,.225),.90,'shoes',['sneaker'],None),
]

def shoe_pair(kind,name):
    """Original low loafer/sneaker forms, not a branded product model."""
    root=bpy.data.objects.new(name,None);scene.collection.objects.link(root)
    leather=material(name+' supple upper',(.19,.10,.047) if kind=='loafer' else (.77,.75,.70),.36 if kind=='loafer' else .65)
    sole=material(name+' outsole',(.07,.043,.025) if kind=='loafer' else (.58,.56,.50),.76)
    inner=material(name+' shadowed foot opening',(.022,.018,.014),.95)
    trim=material(name+' welt and laces',(.3,.20,.115) if kind=='loafer' else (.91,.89,.82),.77)
    def mesh_obj(label,vertices,faces,mat):
        me=bpy.data.meshes.new(label);me.from_pydata(vertices,[],faces);me.update()
        obj=bpy.data.objects.new(label,me);scene.collection.objects.link(obj);obj.parent=root
        obj.data.materials.append(mat)
        for polygon in me.polygons:polygon.use_smooth=True
        return obj
    def line(label,points,mat,radius=.0013):
        curve=bpy.data.curves.new(label,'CURVE');curve.dimensions='3D';curve.bevel_depth=radius;curve.bevel_resolution=2;curve.resolution_u=6
        poly=curve.splines.new('POLY');poly.points.add(len(points)-1)
        for p,co in zip(poly.points,points):p.co=(*co,1)
        obj=bpy.data.objects.new(label,curve);scene.collection.objects.link(obj);obj.parent=root;curve.materials.append(mat)
    for index,offset in enumerate([-.077,.077]):
        vertices=[];faces=[];sections=26;sides=20
        for row in range(sections+1):
            t=row/sections;y=-.172+t*.295
            width=max(.004,.061*math.sin(math.pi*t)**.35*(1-.13*t))
            height=.046+.026*math.sin(math.pi*t)+.014*t
            for col in range(sides+1):
                u=col/sides*2-1
                vertices.append((offset+width*u,y,.027+height*max(0,1-u*u)**.47))
        for row in range(sections):
            for col in range(sides):
                a=row*(sides+1)+col;faces.append((a,a+1,a+sides+2,a+sides+1))
        upper=mesh_obj(f'{name} upper {index}',vertices,faces,leather)
        mod=upper.modifiers.new('Leather thickness','SOLIDIFY');mod.thickness=.004
        verts=[];faces=[];segments=64
        for z,scale in [(.004,.99),(.019,1.01),(.028,1)]:
            for j in range(segments):
                a=j/segments*math.tau
                verts.append((offset+math.cos(a)*.063*scale,-.025+math.sin(a)*.15*scale,z))
        for row in range(2):
            for j in range(segments):
                a=row*segments+j;b=row*segments+(j+1)%segments
                faces.append((a,b,b+segments,a+segments))
        faces.append(tuple(range(segments-1,-1,-1)))
        mesh_obj(f'{name} layered sole {index}',verts,faces,sole)
        opening=[]
        for j in range(48):
            a=j/48*math.tau
            opening.append((offset+math.cos(a)*.037,.067+math.sin(a)*.041,.081))
        if kind=='loafer':
            mesh_obj(f'{name} foot opening {index}',opening,[tuple(range(48))],inner)
            line(f'{name} collar binding {index}',opening+[opening[0]],leather,.003)
            line(f'{name} penny strap {index}',[(offset-.055,-.009,.064),(offset-.032,-.01,.095),(offset,-.012,.108),(offset+.032,-.01,.095),(offset+.055,-.009,.064)],leather,.009)
            seam=[]
            for j in range(29):
                a=math.pi+j/28*math.pi
                seam.append((offset+math.cos(a)*.045,-.04+math.sin(a)*.093,.066-.012*abs(math.sin(a))))
            line(f'{name} moccasin seam {index}',seam,trim,.0011)
        else:
            for j in range(5):
                y=-.030+j*.018
                line(f'{name} lace {index}-{j}',[(offset-.022,y,.103),(offset,y+.008,.107),(offset+.022,y,.103)],trim,.002)
            line(f'{name} side panel stitch {index}',[(offset-.05,-.08,.055),(offset-.058,-.01,.059),(offset-.046,.07,.06)],trim,.0013)
    # Convert detail curves to mesh so glTF retains the visible seams and laces.
    for child in list(root.children_recursive):
        if child.type=='CURVE':
            bpy.ops.object.select_all(action='DESELECT');child.select_set(True);bpy.context.view_layer.objects.active=child
            bpy.ops.object.convert(target='MESH')
    return root

slot_roots=[]
for slot,kind,color,position,scale,category,supported,variant in slot_specs:
    root=shoe_pair(kind,slot) if kind in ['loafer','sneaker'] else make_garment(kind,color,name=slot,variant=variant)
    root.name=slot
    root.location=position
    root.scale=(scale,scale,scale)
    root['slot']=slot
    root['category']=category
    root['supportedKinds']=supported
    root['representation']='type-based Blender garment, not a product replica'
    # glTF only exports meshes: retain the hanger, seam, and binding geometry.
    # Merge these small details by material within each selectable garment.
    detail_groups={}
    for child in list(root.children_recursive):
        if child.type!='CURVE': continue
        bpy.ops.object.select_all(action='DESELECT')
        child.select_set(True)
        bpy.context.view_layer.objects.active=child
        bpy.ops.object.convert(target='MESH')
        child=bpy.context.object
        label=child.data.materials[0].name if child.data.materials else 'unassigned'
        detail_groups.setdefault(label,[]).append(child)
    for label,details in detail_groups.items():
        if len(details)>1:
            bpy.ops.object.select_all(action='DESELECT')
            for child in details: child.select_set(True)
            bpy.context.view_layer.objects.active=details[0]
            bpy.ops.object.join()
        details[0].name=f'{slot} detail — {label}'
    # Preserve smooth final renders, while exporting the already detailed base mesh.
    for child in root.children_recursive:
        for modifier in child.modifiers:
            if modifier.type=='SUBSURF':
                modifier.levels=0
                modifier.render_levels=1
    slot_roots.append(root)

# Keep dark wool and cotton legible under the broad architectural lighting.
# A high white sheen made the navy blazer and olive jacket appear pastel.
for mat in bpy.data.materials:
    if not mat.use_nodes or not any(key in mat.name for key in ['blazer-wool','blazer-lapel','cloth-fieldjacket-']):
        continue
    bs=mat.node_tree.nodes.get('Principled BSDF')
    if bs:
        bs.inputs['Sheen Weight'].default_value=.025
        bs.inputs['Specular IOR Level'].default_value=.25
        rgba=bs.inputs['Base Color'].default_value
        bs.inputs['Base Color'].default_value=tuple(float(c)*.8 for c in rgba[:3])+(1,)

# Large soft sources and warm interior strips yield grounded, readable shadows.
area('Large daylight softbox',(-3.3,-3.8,4.6),(0,-.1,1.1),800,(1,.93,.82),'RECTANGLE',4,3.4)
area('Broad front fill',(2.4,-4.3,3.2),(.6,0,1.5),250,(.81,.88,1),'RECTANGLE',3,3)
area('Soft overhead ambience',(0,-.6,3.25),(0,-.5,.1),110,(1,.91,.78),'RECTANGLE',4.8,2)

bpy.ops.object.camera_add(location=(-.06,-7.85,2.05))
camera=bpy.context.object;camera.name='WearNext front room camera'
target=Vector((0,-.04,1.43))
camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.lens=43
camera.data.sensor_width=36
scene.camera=camera
camera.data.clip_end=100

# Apply static geometry modifiers and merge by material for a small draw budget.
for obj in static_meshes:
    bpy.context.view_layer.objects.active=obj
    for modifier in list(obj.modifiers):
        try: bpy.ops.object.modifier_apply(modifier=modifier.name)
        except RuntimeError: pass
groups={}
for obj in static_meshes:
    key=obj.data.materials[0].name if obj.data.materials else 'unassigned'
    groups.setdefault(key,[]).append(obj)
for label,objects in groups.items():
    if len(objects)<2: continue
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join()
    objects[0].name=f'Room — {label}'

bpy.context.view_layer.update()
slots=[]
for spec,root in zip(slot_specs,slot_roots):
    points=[]
    for child in root.children_recursive:
        if child.type=='MESH': points.extend(child.matrix_world@Vector(v) for v in child.bound_box)
    lo=Vector(tuple(min(p[i] for p in points) for i in range(3)))
    hi=Vector(tuple(max(p[i] for p in points) for i in range(3)))
    center=(lo+hi)*.5
    screen=world_to_camera_view(scene,camera,center)
    converted=lambda v:[round(v.x,5),round(v.z,5),round(-v.y,5)]
    root['center']=converted(center)
    root['posterX']=float(screen.x);root['posterY']=float(1-screen.y)
    slots.append({'id':root.name,'category':spec[5],'kind':spec[1],'supportedKinds':spec[6],
        'color':spec[2],'gltfCenter':converted(center),'blenderCenter':list(center),
        'poster':{'x':round(screen.x,6),'y':round(1-screen.y,6)},
        'variant':spec[7],
        'bounds':{'min':[round(lo.x,5),round(lo.z,5),round(-hi.y,5)],'max':[round(hi.x,5),round(hi.z,5),round(-lo.y,5)]}})

for image in bpy.data.images:
    if image.source=='FILE' and not image.packed_file:
        try:image.pack()
        except RuntimeError:pass
blend_path=OUT/'WearNext-wardrobe.blend'
bpy.context.preferences.filepaths.save_version=0
for screen in bpy.data.screens:
    for editor in screen.areas:
        if editor.type=='VIEW_3D':
            editor.spaces.active.shading.type='MATERIAL'
            editor.spaces.active.region_3d.view_perspective='CAMERA'
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
bpy.ops.object.select_all(action='DESELECT')
for obj in scene.objects:
    if obj.type in {'MESH','EMPTY'}: obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'wardrobe.glb'),export_format='GLB',use_selection=True,
    export_extras=True,export_yup=True,export_apply=True,export_cameras=False,export_lights=False,
    export_materials='EXPORT',export_texcoords=True,export_normals=True)

triangles=sum(len(poly.vertices)-2 for obj in scene.objects if obj.type=='MESH' for poly in obj.data.polygons)
metadata={'version':1,'producer':'Blender '+bpy.app.version_string,'asset':'wardrobe.glb',
    'representation':'Original type-based room and clothing geometry. Not scans or exact product replicas.',
    'poster':'room-front.webp','preview':'room-preview.webp','posterSize':[scene.render.resolution_x,scene.render.resolution_y],
    'camera':{'position':[camera.location.x,camera.location.z,-camera.location.y],
              'target':[target.x,target.z,-target.y],'fov':math.degrees(2*math.atan(math.tan(camera.data.angle_x/2)/(scene.render.resolution_x/scene.render.resolution_y))),'lens':camera.data.lens},
    'slots':slots,'trianglesBeforeExport':triangles,
    'meshCount':sum(obj.type=='MESH' for obj in scene.objects),'draft':DRAFT}
(OUT/'scene-meta.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
print('ASSETS_EXPORTED',json.dumps({'meshes':metadata['meshCount'],'triangles':triangles,'elapsed':round(time.monotonic()-START,1)}),flush=True)
if not ARGS.skip_render:
    name='room-preview' if DRAFT else 'room-front'
    path=OUT/f'{name}.png'
    scene.render.filepath=str(path)
    bpy.ops.render.render(write_still=True)
    Image.open(path).convert('RGB').save(OUT/f'{name}.webp','WEBP',quality=94,method=6)
    print('RENDER_READY',str(OUT/f'{name}.webp'),'seconds',round(time.monotonic()-START,1),flush=True)
