"""Packed, tintable PBR textile tiles shared by Cycles and glTF.

Albedo is neutral grayscale. Hue lives only in the material multiplier, so the
web client can recolor cloth without throwing away weave/roughness/normal maps.
"""
import bpy
import numpy as np


def family_for(name, knit=False):
    if knit or 'knit' in name: return 'knit'
    if 'blazer' in name or 'wool' in name: return 'hopsack'
    if 'field' in name or 'trouser' in name: return 'sateen'
    if 'denim' in name: return 'denim'
    return 'oxford'


def _image(name, rgb, noncolor=False):
    existing=bpy.data.images.get(name)
    if existing: return existing
    height,width=rgb.shape[:2]
    image=bpy.data.images.new(name,width=width,height=height,alpha=True)
    image.colorspace_settings.name='Non-Color' if noncolor else 'sRGB'
    pixels=np.ones((height,width,4),dtype=np.float32)
    pixels[:,:,:3]=rgb
    image.pixels.foreach_set(pixels.ravel())
    image.update()
    image.pack()
    return image


def tiles(family, roughness=.8):
    size=256
    y,x=np.mgrid[0:size,0:size]/size
    rng=np.random.default_rng(71)
    if family=='hopsack':
        warp=np.cos(x*np.pi*32)**4;weft=np.cos(y*np.pi*32)**4
        cross=((np.floor(x*16)+np.floor(y*16))%2)
        height=.62*np.where(cross,warp,weft)+.16*np.minimum(warp,weft)
        scale=.018
    elif family in ('sateen','denim'):
        height=.5+.32*np.cos((x-y)*np.pi*96)+.1*np.cos(y*np.pi*128)
        scale=.025
    elif family=='knit':
        yarn=np.cos((x*14 + .20*np.cos(y*np.pi*28))*np.pi*2)
        height=.45+.30*yarn+.16*np.cos(y*np.pi*28)
        scale=.026
    else:
        warp=np.cos(x*np.pi*64)**4;weft=np.cos(y*np.pi*64)**4
        cross=((np.floor(x*32)+np.floor(y*32))%2)
        height=.6*np.where(cross,warp,weft)+.14*np.minimum(warp,weft)
        scale=.024
    grain=rng.normal(0,.015,height.shape)
    height=np.clip(height+grain,0,1)
    # Keep albedo contrast restrained; the weave should not resemble printed dots.
    value=np.clip(.955+.045*(height-.5)+grain*.15,.89,1)
    if family=='stripe':
        value*=np.where(x<.48,.70,1.)
        scale=.014
    albedo=np.repeat(value[:,:,None],3,axis=2)
    dx=(np.roll(height,-1,1)-np.roll(height,1,1))*.32
    dy=(np.roll(height,-1,0)-np.roll(height,1,0))*.32
    vectors=np.stack((-dx,-dy,np.ones_like(height)),axis=2)
    vectors/=np.linalg.norm(vectors,axis=2)[:,:,None]
    normal=vectors*.5+.5
    rough=np.clip(roughness+.055*(.5-height),.35,.96)
    # glTF exporter gathers the green roughness channel into its packed ORM map.
    rough_rgb=np.repeat(rough[:,:,None],3,axis=2)
    prefix=f'wearnext-{family}'
    return (_image(prefix+'-neutral-albedo',albedo),
            _image(prefix+'-tangent-normal',normal,True),
            _image(prefix+f'-roughness-{round(roughness*100)}',rough_rgb,True),scale)


def apply_textile(mat, rgb_linear, family='oxford', roughness=.8):
    mat.use_nodes=True
    nodes,links=mat.node_tree.nodes,mat.node_tree.links
    bsdf=nodes.get('Principled BSDF')
    for node in list(nodes):
        if node not in (bsdf,nodes.get('Material Output')):nodes.remove(node)
    albedo,normal,rough,scale=tiles(family,roughness)
    uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
    mapping=nodes.new('ShaderNodeMapping');mapping.vector_type='POINT'
    mapping.inputs['Scale'].default_value=(1/scale,1/scale,1)
    links.new(uv.outputs['UV'],mapping.inputs['Vector'])
    textures=[]
    for name,image in [('Neutral cloth weave',albedo),('Tangent cloth normal',normal),('Cloth roughness',rough)]:
        tex=nodes.new('ShaderNodeTexImage');tex.name=name;tex.image=image;tex.extension='REPEAT';tex.interpolation='Linear'
        links.new(mapping.outputs['Vector'],tex.inputs['Vector']);textures.append(tex)
    # Blender's glTF exporter recognizes a constant × texture MIX/MULTIPLY node.
    tint=nodes.new('ShaderNodeMix');tint.data_type='RGBA';tint.blend_type='MULTIPLY'
    tint.inputs[0].default_value=1
    tint.inputs[7].default_value=(*rgb_linear,1)
    links.new(textures[0].outputs['Color'],tint.inputs[6])
    links.new(tint.outputs[2],bsdf.inputs['Base Color'])
    normal_node=nodes.new('ShaderNodeNormalMap');normal_node.inputs['Strength'].default_value=.30 if family=='knit' else .22
    links.new(textures[1].outputs['Color'],normal_node.inputs['Color'])
    links.new(normal_node.outputs['Normal'],bsdf.inputs['Normal'])
    channel=nodes.new('ShaderNodeSeparateColor');channel.mode='RGB'
    links.new(textures[2].outputs['Color'],channel.inputs[0]);links.new(channel.outputs['Green'],bsdf.inputs['Roughness'])
    bsdf.inputs['Metallic'].default_value=0
    bsdf.inputs['IOR'].default_value=1.46
    bsdf.inputs['Specular IOR Level'].default_value=.22
    # Blender 5.2's glTF exporter gates on Weight but exports only Tint. Put
    # strength into Tint so the browser does not receive full-strength white fuzz.
    sheen=.10 if family=='knit' else .045
    bsdf.inputs['Sheen Weight'].default_value=1
    bsdf.inputs['Sheen Tint'].default_value=(sheen,sheen,sheen,1)
    bsdf.inputs['Sheen Roughness'].default_value=.75
    mat.diffuse_color=(*rgb_linear,1)
    mat['wearnextTintable']=True
    mat['fabricFamily']=family
    mat['textureColorContract']='neutral grayscale albedo multiplied by baseColorFactor; retain normal and roughness maps'
    return mat
