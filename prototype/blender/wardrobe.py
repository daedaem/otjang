"""Build the original WearNext oak dressing room and portable Blender/GLB assets.

Run with the project's bpy interpreter: python wardrobe.py --draft or --final.
The provided garment cache retains its attribution in README.md.
No personal photographs or downloaded marketplace assets are used.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import sys
import time

import bpy
import bmesh
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
scene.view_settings.exposure = -.1
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.72, .77, .84, 1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .15

def material(name, color, roughness=.6, metallic=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = roughness
    bs.inputs['Metallic'].default_value = metallic
    m.diffuse_color = (*color, 1)
    return m

def packed_image(name, pixels, noncolor=False):
    target=OUT/f'{name}.png'
    Image.fromarray(np.asarray(pixels,dtype=np.uint8)).save(target,optimize=True)
    image=bpy.data.images.load(str(target),check_existing=False)
    image.name=name
    if noncolor:image.colorspace_settings.name='Non-Color'
    image.pack()
    return image

def grain_image(name, base, seed, strength=1):
    """Nonperiodic quarter-sawn grain: random fibers, pores, and slow figure.

    The UV footprint is 0.5m across the grain and 2m along it. Color, surface
    normal, and roughness are image maps so the browser retains the material.
    """
    size=1024
    rng=np.random.default_rng(seed)
    def field(nx,ny):
        a=rng.normal(0,1,(ny,nx)).astype('float32')
        return np.asarray(Image.fromarray(a).resize((size,size),Image.Resampling.BICUBIC))
    growth=field(128,3)
    fibers=field(900,40)
    figure=field(17,3)
    warp=field(9,4)*6
    xs=(np.arange(size)[None,:]+warp).astype(int)%size
    growth=np.take_along_axis(growth,xs,axis=1)
    fibers=np.take_along_axis(fibers,xs,axis=1)
    pores=np.maximum(0,fibers-1.0)**1.4
    value=strength*(growth*5.4+figure*2.3+fibers*1.2-pores*3.3)
    color=np.clip(np.asarray(base)[None,None,:]+value[:,:,None]*np.array([1,.88,.72]),0,255)
    base_image=packed_image(name,color)
    height=np.asarray(Image.fromarray((growth*.45+fibers*.10+pores*.13).astype('float32')).resize((512,512),Image.Resampling.BICUBIC))
    dy,dx=np.gradient(height)
    normals=np.stack((-dx*.21,-dy*.21,np.ones_like(dx)),axis=2)
    normals/=np.linalg.norm(normals,axis=2,keepdims=True)
    normal_image=packed_image(name+'-normal',(normals*.5+.5)*255,True)
    roughness=np.clip(153+height*8,125,178)
    rough_image=packed_image(name+'-roughness',roughness,True)
    return base_image,normal_image,rough_image

def textured_material(name, images, roughness=.55):
    m = material(name, (.55, .4, .24), roughness)
    tex = m.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = images[0]
    tex.extension = 'REPEAT'
    m.node_tree.links.new(tex.outputs['Color'], m.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    normal=m.node_tree.nodes.new('ShaderNodeTexImage');normal.image=images[1]
    normal_map=m.node_tree.nodes.new('ShaderNodeNormalMap')
    normal_map.inputs['Strength'].default_value=.45
    m.node_tree.links.new(normal.outputs['Color'],normal_map.inputs['Color'])
    m.node_tree.links.new(normal_map.outputs['Normal'],m.node_tree.nodes['Principled BSDF'].inputs['Normal'])
    rough=m.node_tree.nodes.new('ShaderNodeTexImage');rough.image=images[2]
    m.node_tree.links.new(rough.outputs['Color'],m.node_tree.nodes['Principled BSDF'].inputs['Roughness'])
    return m

oak = textured_material('Warm quarter-sawn walnut', grain_image('oak-grain', (143, 111, 80), 84, .9))
smoked = textured_material('Smoked walnut interior', grain_image('smoked-oak-grain', (103, 83, 62), 47, .75), .7)
pale_wood = textured_material('Pale oak floor', grain_image('floor-grain', (161, 149, 129), 124, .65), .74)
wall = material('Warm limestone plaster', (.64,.61,.55), .94)
ceiling_mat = material('Soft ivory paint', (.8,.78,.73), .91)
brass = material('Brushed champagne brass', (.54,.37,.17), .28, .75)
dark_bronze = material('Aged bronze', (.13,.105,.07), .38, .65)
linen = material('Natural unbleached linen', (.62,.59,.51), .95)
rug_mat = material('Oatmeal flatwoven wool', (.47,.43,.36), .98)
led = material('Warm integrated light diffuser', (.92,.75,.49), .45)
led_bs = led.node_tree.nodes['Principled BSDF']
led_bs.inputs['Emission Color'].default_value = (1,.69,.37,1)
led_bs.inputs['Emission Strength'].default_value = .7

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
            horizontal=obj.dimensions.x>obj.dimensions.z and obj.dimensions.x>obj.dimensions.y
            a,b=(co.y,co.x) if axis==2 and horizontal else (co.x,co.y) if axis==2 else (co.y,co.z) if axis==0 else (co.z,co.x) if horizontal else (co.x,co.z)
            offset=(sum(ord(c) for c in obj.name)%131)/131
            uv.data[loop_index].uv=(a*2+offset,b*.5+offset*.37)

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

# A compact private dressing room, framed close enough for the clothes to lead.
# Cabinet proportions follow the actual garment width, rather than equal bays.
box('Limestone rear wall',(0,.43,1.6),(7,.15,3.2),wall,.004)
box('Right plaster return',(3.1,-1.25,1.6),(.12,3.5,3.2),wall,.004)
box('Ceiling',(0,-1.1,3.21),(6.4,3.5,.08),ceiling_mat,0)
box('Floor substructure',(0,-1.35,-.05),(6.5,4.5,.09),pale_wood,0)
for n in range(35):
    x=-3.15+n*.185
    box(f'Oak floor board {n:02d}',(x,-1.35,-.003),(.184,4.5,.012),pale_wood,.0005)
box('Recessed wall skirting',(0,.31,.042),(6,.024,.083),smoked,.002)

# A real opening and slender mullions cast the directional window light.
# The window sits largely outside the hero frame; its light is the decoration.
window_x=-2.58
for name,pos,size in [
    ('Window lower plaster',(window_x,-1.15,.31),(.14,2.8,.62)),
    ('Window header plaster',(window_x,-1.15,3.00),(.14,2.8,.40)),
    ('Window rear pier',(window_x,.18,1.7),(.14,.34,2.20)),
    ('Window front pier',(window_x,-2.47,1.7),(.14,.16,2.20))]:
    box(name,pos,size,wall,.004)
for y in [-2.35,-1.21,-.065]:
    box('Bronze window mullion',(window_x-.017,y,1.7),(.047,.029,2.13),dark_bronze,.003)
for z in [.64,1.72,2.78]:
    box('Bronze window transom',(window_x-.017,-1.21,z),(.047,2.31,.028),dark_bronze,.003)
box('Deep limestone sill',(window_x+.045,-1.21,.625),(.33,2.4,.043),wall,.006)

# Fine cabinet joinery: shadow plinth, narrow face frames, and inset fronts.
box('Cabinet recessed plinth',(0,.0,.078),(3.78,.61,.15),smoked,.004)
box('Cabinet bottom slab',(0,-.07,.185),(3.87,.76,.046),oak,.004)
box('Cabinet crown',(0,-.07,2.465),(3.88,.76,.046),oak,.004)
for n,x in enumerate([-1.91,-.40,1.12,1.91]):
    box(f'Walnut partition {n}',(x,-.035,1.33),(.038,.69,2.23),oak,.003)
    box(f'Thin front stile {n}',(x,-.394,1.33),(.043,.022,2.23),oak,.0025)
for bay,(center,width) in enumerate([(-1.155,1.47),(.36,1.48),(1.515,.75)]):
    box(f'Smoked walnut back {bay}',(center,.289,1.33),(width,.026,2.23),smoked,.002)
    # Single join between wide veneer leaves, not evenly repeated stripes.
    box(f'Veneer bookmatch reveal {bay}',(center,.272,1.33),(.0025,.004,2.20),dark_bronze,0)
    box(f'Cabinet upper shelf {bay}',(center,-.025,2.305),(width,.64,.028),oak,.003)
    box(f'Recessed upper light channel {bay}',(center,-.32,2.285),(width-.12,.028,.012),dark_bronze,.002)
    box(f'Frosted upper LED {bay}',(center,-.325,2.278),(width-.14,.013,.006),led,.001)
    area(f'Quiet shelf wash {bay}',(center,-.28,2.273),(center,.14,1.5),5,(1,.82,.64),'RECTANGLE',width-.18,.055)

for bay,(center,width) in enumerate([(-1.155,1.47),(.36,1.48)]):
    cylinder(f'Brass rail {bay}',(center,-.225,2.184),.012,width-.012,brass,(0,math.pi/2,0),32)
    for side in [-1,1]:
        cylinder(f'Brass socket {bay}-{side}',(center+side*(width/2-.008),-.225,2.184),.019,.018,brass,(0,math.pi/2,0),24)
    box(f'Drawer countertop {bay}',(center,-.04,1.071),(width,.68,.034),oak,.004)
    box(f'Drawer dark reveal {bay}',(center,-.025,.625),(width-.013,.61,.853),smoked,.003)
    for n,z in enumerate([.419,.848]):
        box(f'Inset walnut drawer {bay}-{n}',(center,-.374,z),(width-.018,.034,.408),oak,.004)
        # Edge pulls sit close to the front rather than oversized decorative bars.
        box(f'Brass drawer edge pull {bay}-{n}',(center,-.399,z+.175),(.145,.021,.009),brass,.0015)
        box(f'Drawer shadow finger recess {bay}-{n}',(center,-.391,z+.166),(.17,.008,.021),dark_bronze,.0015)

# Narrow shelves: two folded trousers share a shelf, shoes have separate cubbies.
for index,z in enumerate([.615,1.03,1.445,1.845]):
    box(f'Right walnut shelf {index}',(1.515,-.035,z),(.75,.68,.027),oak,.003)
    if index in [0,2]:
        box(f'Subtle shelf strip {index}',(1.515,-.315,z-.018),(.61,.011,.005),led,.001)

# Only one subdued textile plane remains in the foreground; no ornamental props.
box('Understated woven runner',(-.18,-1.06,.005),(3.26,1.24,.012),rug_mat,.017)

# Clothing groups are separate roots for interaction in Three.js.
slot_specs=[
    ('slot_01','shirt','white',(-1.55,-.23,2.044),1.0,'top',['shirt'],None),
    ('slot_02','shirt','blue',(-.84,-.23,2.044),1.0,'top',['shirt'],None),
    ('slot_03','blazer','navy',(-.02,-.23,2.044),1.0,'outer',['blazer','jacket'],None),
    ('slot_04','fieldjacket','olive',(.70,-.23,2.044),1.0,'outer',['fieldjacket','chore','jacket'],None),
    ('slot_05','chino','beige',(1.335,-.085,1.046),1.04,'bottom',['chino','trouser'],'folded'),
    ('slot_06','denim','navy',(1.695,-.085,1.046),1.04,'bottom',['denim'],'folded'),
    ('slot_07','knit','cream',(1.515,-.065,1.461),1.16,'top',['knit'],'folded'),
    ('slot_08','tshirt','white',(1.515,-.065,1.861),1.16,'top',['tshirt','tee'],'folded'),
    ('slot_09','loafer','brown',(1.515,-.04,.211),1.0,'shoes',['loafer'],None),
    ('slot_10','sneaker','white',(1.515,-.04,.631),1.0,'shoes',['sneaker'],None),
]

def shoe_pair(kind,name):
    """Original unbranded lasted shoes with real collar openings and layered soles."""
    root=bpy.data.objects.new(name,None);scene.collection.objects.link(root)
    root['kind']=kind;root['color']='brown' if kind=='loafer' else 'white'
    leather=material(name+' calf leather' if kind=='loafer' else name+' matte leather upper',
                     (.13,.061,.028) if kind=='loafer' else (.73,.715,.675),.37 if kind=='loafer' else .57)
    sole=material(name+' leather outsole' if kind=='loafer' else name+' rubber cupsole',
                  (.039,.029,.019) if kind=='loafer' else (.55,.53,.475),.66)
    welt=material(name+' stitched welt',(.135,.087,.045) if kind=='loafer' else (.77,.75,.69),.64)
    lining=material(name+' inner calf lining',(.16,.105,.057) if kind=='loafer' else (.34,.32,.28),.81)
    insole=material(name+' shadowed footbed',(.045,.03,.018),.88)
    thread=material(name+' waxed stitch' if kind=='loafer' else name+' cotton laces',
                    (.24,.17,.10) if kind=='loafer' else (.88,.85,.77),.81)
    rng=np.random.default_rng(901 if kind=='loafer' else 904)
    grain=rng.normal(0,.7,(256,256)).astype('float32')
    dy,dx=np.gradient(grain)
    nm=np.stack((-dx*.11,-dy*.11,np.ones_like(dx)),axis=2)
    nm/=np.linalg.norm(nm,axis=2,keepdims=True)
    normal=packed_image(name+'-leather-normal',(nm*.5+.5)*255,True)
    nodes=leather.node_tree.nodes;links=leather.node_tree.links
    tex=nodes.new('ShaderNodeTexImage');tex.image=normal
    nmap=nodes.new('ShaderNodeNormalMap');nmap.inputs['Strength'].default_value=.3
    links.new(tex.outputs['Color'],nmap.inputs['Color']);links.new(nmap.outputs['Normal'],nodes['Principled BSDF'].inputs['Normal'])
    parent=root
    def mesh_obj(label,vertices,faces,mat):
        me=bpy.data.meshes.new(label);me.from_pydata(vertices,[],faces);me.update()
        obj=bpy.data.objects.new(label,me);scene.collection.objects.link(obj);obj.parent=parent
        me.materials.append(mat)
        uv=me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            poly.use_smooth=True
            for li in poly.loop_indices:
                v=me.vertices[me.loops[li].vertex_index].co
                uv.data[li].uv=(v.x*12,v.y*12)
        return obj
    def line(label,points,mat,radius=.0007):
        cu=bpy.data.curves.new(label,'CURVE');cu.dimensions='3D';cu.bevel_depth=radius;cu.bevel_resolution=2
        spline=cu.splines.new('POLY');spline.points.add(len(points)-1)
        for p,co in zip(spline.points,points):p.co=(*co,1)
        obj=bpy.data.objects.new(label,cu);scene.collection.objects.link(obj);obj.parent=parent;cu.materials.append(mat)
        return obj
    def soft_profile(t,positions,values):
        i=min(len(positions)-2,max(0,int(np.searchsorted(positions,t))-1))
        u=max(0,min(1,(t-positions[i])/(positions[i+1]-positions[i])))
        u=u*u*(3-2*u)
        return values[i]*(1-u)+values[i+1]*u
    def width(t):
        return soft_profile(t,[0,.055,.20,.38,.61,.78,.94,1],[.004,.038,.052,.051,.037,.040,.039,.018])
    def high(t):
        return soft_profile(t,[0,.12,.35,.56,.78,.96,1],[.023,.041,.056,.075,.09,.088,.055])
    def surface(t,u,extra=0):
        h=high(t)+(0.013 if kind=='sneaker' else 0)
        return (width(t)*u,-.15+t*.304,.026+h*max(0,1-u*u)**.56+extra)
    def hole(t):
        return math.sqrt(max(0,math.sin(math.pi*max(0,min(1,(t-.52)/.43)))))*.70 if .52<t<.95 else 0
    for index,offset in enumerate([-.077,.077]):
        parent=bpy.data.objects.new(f'{name} shoe {index}',None);scene.collection.objects.link(parent);parent.parent=root
        parent.location=(offset,.008 if index else -.008,0)
        parent.rotation_euler.z=math.radians(-5 if index else 5)
        rows=64;cols=14
        uppers=[]
        # Two upper sections meet along the vamp and leave an actual opening at the collar.
        for side in [-1,1]:
            vertices=[];faces=[]
            for row in range(rows+1):
                t=row/rows;opening=hole(t)
                for col in range(cols+1):
                    u=side*(opening+(1-opening)*col/cols)
                    vertices.append(surface(t,u))
            for row in range(rows):
                for col in range(cols):
                    a=row*(cols+1)+col
                    face=(a,a+1,a+cols+2,a+cols+1)
                    faces.append(tuple(reversed(face)) if side==-1 else face)
            upper=mesh_obj(f'{name} lasted upper {index}-{side}',vertices,faces,leather)
            mod=upper.modifiers.new('Leather edge thickness','SOLIDIFY');mod.thickness=.0018
            uppers.append(upper)
        # Weld the vamp center so its normals flow across both sides of the last.
        bpy.ops.object.select_all(action='DESELECT')
        for upper in uppers:upper.select_set(True)
        bpy.context.view_layer.objects.active=uppers[0]
        bpy.ops.object.join()
        bm=bmesh.new();bm.from_mesh(uppers[0].data)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(uppers[0].data);bm.free();uppers[0].data.update()
        for t,label in [(0,'toe'),(1,'heel')]:
            edge=[surface(t,u) for u in np.linspace(-1,1,33)]
            face=tuple(range(32,-1,-1)) if t==0 else tuple(range(33))
            mesh_obj(f'{name} closed {label} end {index}',edge,[face],leather)
        opening=[]
        for side,steps in [(-1,range(42)),(1,range(41,-1,-1))]:
            for j in steps:
                t=.526+j/41*.418
                opening.append(surface(t,side*hole(t),.0009))
        # Turned collar and a recessed lining make an opening, not a painted black ellipse.
        bottom=[(x*.86,y,.042) for x,y,z in opening]
        n=len(opening);faces=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        mesh_obj(f'{name} turned collar lining {index}',opening+bottom,faces,lining)
        mesh_obj(f'{name} recessed insole {index}',bottom,[tuple(range(n))],insole)
        line(f'{name} collar piping {index}',opening+[opening[0]],leather,.0016)
        outline=[]
        for side,steps in [(-1,range(65)),(1,range(64,-1,-1))]:
            for j in steps:
                t=j/64;outline.append((side*(width(t)+.003),-.15+t*.304,t))
        n=len(outline);vertices=[];faces=[]
        levels=[(.001,1),(.009,1.008),(.019,1)] if kind=='loafer' else [(.001,1),(.013,1.012),(.029,1)]
        for z,scale in levels:
            for x,y,t in outline:
                rocker=.004*(1-t)**6
                vertices.append((x*scale,y,rocker+z))
        for level in range(2):
            for j in range(n):
                a=level*n+j;b=level*n+(j+1)%n;faces.append((a+n,b+n,b,a))
        faces.append(tuple(range(n)))
        mesh_obj(f'{name} contoured outsole {index}',vertices,faces,sole)
        line(f'{name} welt edge {index}',[(x,y,.025 if kind=='loafer' else .031) for x,y,t in outline]+[(outline[0][0],outline[0][1],.025 if kind=='loafer' else .031)],welt,.002)
        if kind=='loafer':
            # A broad curved penny strap and sewn apron distinguish the loafer last.
            verts=[];faces=[];segments=24
            for j in range(segments+1):
                u=-.92+1.84*j/segments
                verts.extend([surface(.425,u,.0025),surface(.49,u,.0025)])
            for j in range(segments):faces.append((j*2+2,j*2+3,j*2+1,j*2))
            strap=mesh_obj(f'{name} curved penny saddle {index}',verts,faces,leather)
            mod=strap.modifiers.new('Saddle thickness','SOLIDIFY');mod.thickness=.002
            apron=[]
            for j in range(41):
                a=math.pi+j/40*math.pi
                t=.32+math.sin(a)*.22
                apron.append(surface(t,math.cos(a)*.77,.001))
            line(f'{name} hand sewn apron {index}',apron,thread,.00065)
            line(f'{name} penny saddle slit {index}',[surface(.457,u,.0047) for u in np.linspace(-.17,.17,11)],insole,.0008)
            heel=[(x,y,.002) for x,y,t in outline if t>.72]
            if heel:
                verts=heel+[(x,y,.019) for x,y,z in heel];nheel=len(heel)
                faces=[(i+nheel,(i+1)%nheel+nheel,(i+1)%nheel,i) for i in range(nheel)]
                mesh_obj(f'{name} stacked leather heel {index}',verts,faces,sole)
        else:
            # Tongue, seven crossed laces, and a stitched toe overlay sit on the last.
            verts=[];faces=[]
            for j in range(19):
                t=.35+j/18*.36
                for u in [-.30,0,.30]:verts.append(surface(t,u,.006))
            for j in range(18):
                for k in range(2):
                    a=j*3+k;faces.append((a,a+1,a+4,a+3))
            tongue=mesh_obj(f'{name} padded tongue {index}',verts,faces,leather)
            mod=tongue.modifiers.new('Padded tongue thickness','SOLIDIFY');mod.thickness=.003
            for j in range(7):
                t=.375+j*.038
                line(f'{name} crossed lace {index}-{j}',[surface(t,-.33,.009),surface(t+.018,0,.011),surface(t,.33,.009)],thread,.00125)
            toe=[surface(.265,u,.0008) for u in np.linspace(-.94,.94,36)]
            line(f'{name} toe overlay stitch {index}',toe,thread,.0005)
            for side in [-1,1]:
                line(f'{name} quarter panel seam {index}-{side}',[surface(t,side*.8,.0008) for t in np.linspace(.29,.91,48)],thread,.0006)
    root.rotation_euler.z=math.radians(-9)
    return root

slot_roots=[]
for slot,kind,color,position,scale,category,supported,variant in slot_specs:
    root=shoe_pair(kind,slot) if kind in ['loafer','sneaker'] else make_garment(kind,color,name=slot,variant=variant)
    if kind=='shirt':
        # The pressed cloth sits closer to the archival simulation hanger.
        # Narrow its wooden shoulders and thickness, preserving the central
        # collar seat and the complete metal hook rather than letting wood
        # intersect the visible shirt shoulder.
        for child in root.children_recursive:
            if child.type=='MESH' and child.name.startswith('hanger-wood'):
                for vertex in child.data.vertices:
                    t=min(1,abs(vertex.co.x)/.08)
                    vertex.co.x*=.84
                    vertex.co.y*=.60
                    vertex.co.z-=.012*t*t*(3-2*t)
                child.data.update()
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
    # The detailed base mesh is shared by Cycles and WebGL for matching silhouettes.
    for child in root.children_recursive:
        for modifier in child.modifiers:
            if modifier.type=='SUBSURF':
                modifier.levels=0
                modifier.render_levels=0
    slot_roots.append(root)

# Light enters through the side window; modest fill preserves the garment colors.
area('Directional window daylight',(-3.9,-2.4,3.35),(-.1,0,1.22),950,(1,.955,.89),'RECTANGLE',1.25,1.8)
area('Cool room bounce',(1.7,-3.3,2.25),(-.25,0,1.5),65,(.83,.9,1),'RECTANGLE',2.2,2.8)
area('Soft ceiling return',(0,-.55,3.12),(0,0,1.1),45,(1,.95,.87),'RECTANGLE',2.9,1.5)

bpy.ops.object.camera_add(location=(-1.25,-5.6,1.93))
camera=bpy.context.object;camera.name='WearNext dressing room editorial camera'
target=Vector((-.15,-.04,1.42))
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

def bake_static_ao():
    """One atlas for architecture only; movable clothes never leave baked shadows."""
    objects=[o for o in room_root.children_recursive if o.type=='MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        layer=obj.data.uv_layers.new(name='CabinetAO')
        obj.data.uv_layers.active_index=len(obj.data.uv_layers)-1
        layer.active_render=True
        obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.1519,island_margin=.009,area_weight=.6,correct_aspect=True,scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    atlas=bpy.data.images.new('Room static ambient occlusion',width=1024,height=1024,alpha=False)
    atlas.colorspace_settings.name='Non-Color'
    atlas.pixels.foreach_set(np.ones(1024*1024*4,dtype=np.float32))
    atlas.update()
    originals={obj:tuple(obj.data.materials) for obj in objects}
    hidden={obj:obj.hide_render for root in slot_roots for obj in [root,*root.children_recursive]}
    temporary={}
    for materials in originals.values():
        for mat in materials:
            if mat in temporary:continue
            bake_mat=bpy.data.materials.new('AO bake only '+mat.name)
            bake_mat.use_nodes=True
            nodes=bake_mat.node_tree.nodes;nodes.clear();links=bake_mat.node_tree.links
            out=nodes.new('ShaderNodeOutputMaterial')
            emit=nodes.new('ShaderNodeEmission')
            ao=nodes.new('ShaderNodeAmbientOcclusion');ao.samples=16
            ao.inputs['Distance'].default_value=.55
            links.new(ao.outputs['Color'],emit.inputs['Color'])
            links.new(emit.outputs[0],out.inputs['Surface'])
            tex=nodes.new('ShaderNodeTexImage');tex.image=atlas
            nodes.active=tex;tex.select=True
            temporary[mat]=bake_mat
    old_samples=scene.cycles.samples
    try:
        for obj in hidden:obj.hide_render=True
        for obj,materials in originals.items():
            obj.data.materials.clear()
            for mat in materials:obj.data.materials.append(temporary[mat])
        scene.cycles.samples=8
        scene.render.bake.use_clear=False
        bpy.ops.object.bake(type='EMIT',margin=8,use_clear=False,use_selected_to_active=False)
    finally:
        scene.cycles.samples=old_samples
        for obj,materials in originals.items():
            obj.data.materials.clear()
            for mat in materials:obj.data.materials.append(mat)
            obj.data.uv_layers.active_index=0
            obj.data.uv_layers[0].active_render=True
        for obj,value in hidden.items():obj.hide_render=value
        for mat in temporary.values():bpy.data.materials.remove(mat)
    atlas.filepath_raw=str(OUT/'room-static-ao.png')
    atlas.file_format='PNG';atlas.save();atlas.pack()
    # The glTF exporter recognizes this node group and preserves TEXCOORD_1.
    group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
    group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
    for mat in temporary:
        nodes=mat.node_tree.nodes;links=mat.node_tree.links
        texture=nodes.new('ShaderNodeTexImage');texture.image=atlas;texture.extension='CLIP'
        uv=nodes.new('ShaderNodeUVMap');uv.uv_map='CabinetAO'
        links.new(uv.outputs['UV'],texture.inputs['Vector'])
        mix=nodes.new('ShaderNodeMix');mix.data_type='RGBA';mix.blend_type='MIX'
        mix.inputs[0].default_value=.8;mix.inputs[6].default_value=(1,1,1,1)
        links.new(texture.outputs['Color'],mix.inputs[7])
        output=nodes.new('ShaderNodeGroup');output.node_tree=group
        links.new(mix.outputs[2],output.inputs['Occlusion'])
    print('STATIC_AO_READY',str(OUT/'room-static-ao.png'),flush=True)

bake_static_ao()

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
    'slots':slots,'staticAO':{'image':'room-static-ao.png','size':1024,'uv':'CabinetAO','strength':.8,'distance':.55,'includesGarments':False},
    'cabinetBounds':{'min':[-1.94,.06,-.36],'max':[1.94,2.49,.41]},
    'zones':{'shirts':[-1.155,1.66,.23],'outerwear':[.36,1.64,.23],'shelves':[1.515,1.24,.065]},
    'trianglesBeforeExport':triangles,
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
