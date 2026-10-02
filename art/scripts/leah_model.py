# Leah, the shop's clerk: a cartoon long-haired dachshund (cream coat, golden ears, pink bow),
# lying on the counter in a sphinx pose with her head up. Built from metaballs (soft, toy-like
# shapes), converted to meshes. Meters, Z up, facing -Y. Reference: public/samples/leah-*.jpg.
#
# Parts are separate objects with their pivots where they bend, so the app can animate them:
#   leah (root) > leah_body (+ bow), leah_tail, leah_head > leah_ear_l, leah_ear_r, face parts
#
# Run inside Blender (it adds the 'Leah' collection to the open file, exports, then removes it):
#   writes public/clerk/leah.glb, art/leah.blend and art/previews/leah.png
import bpy, math, os
from mathutils import Vector, Matrix

ROOT = '/home/jk/Documents/PawpAtelier'
S = 0.75  # overall size
WAIST = 1.5  # dachshund back length: torso between chest and rump, relative to the first draft
BACK = (WAIST - 1) * 0.29  # how far everything behind the chest moves back

PAL = {
    'coat': '#F4E8D6', 'chest': '#FBF5EC', 'ear': '#E8CDA2', 'nose': '#2A1F1F', 'eye': '#1E1615',
    'shine': '#FFFFFF', 'mouth': '#5A2A30', 'tongue': '#F07F95', 'bow': '#EE8FAA', 'paw': '#F7EEE2',
}
lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def mat(key, rough=0.8):
    name = 'Leah_' + key
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    h = PAL[key].lstrip('#')
    b.inputs['Base Color'].default_value = (*[lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)], 1)
    b.inputs['Roughness'].default_value = rough
    return m

# ---- clean up a previous run
for o in list(bpy.data.objects):
    if o.name.startswith('leah') or o.name.startswith('Leah'):
        bpy.data.objects.remove(o, do_unlink=True)
for mb in list(bpy.data.metaballs):
    if mb.name.startswith('Leah'): bpy.data.metaballs.remove(mb)
col = bpy.data.collections.get('Leah') or bpy.data.collections.new('Leah')
if col.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(col)

v = lambda x, y, z: Vector((x * S, y * S, z * S))
# A lone metaball's surface sits at ~0.57 of its radius (stiffness 2, threshold 0.6); blending
# with neighbours fattens it again. Scaling radii by K makes the given sizes roughly the real ones.
K = 1.6

def blob(name, elements, key, pivot, resolution=0.006, rough=0.85, decimate=0.35):
    """A soft shape from metaball elements: ('ball', center, r) or ('ell', center, (a, b, c))
    or ('cap', p0, p1, r). Returns a mesh object whose origin is at `pivot`."""
    mb = bpy.data.metaballs.new(name)
    mb.resolution = resolution * S; mb.render_resolution = resolution * S; mb.threshold = 0.6
    for e in elements:
        if e[0] == 'ball':
            el = mb.elements.new(type='BALL'); el.co = v(*e[1]); el.radius = e[2] * S * K
        elif e[0] == 'ell':
            a, b, c = e[2]; r = max(a, b, c)
            el = mb.elements.new(type='ELLIPSOID'); el.co = v(*e[1]); el.radius = r * S * K
            el.size_x, el.size_y, el.size_z = a / r, b / r, c / r
            if len(e) > 3: el.rotation = e[3]
        elif e[0] == 'cap':
            p0, p1 = v(*e[1]), v(*e[2]); d = p1 - p0
            el = mb.elements.new(type='CAPSULE'); el.co = (p0 + p1) / 2; el.radius = e[3] * S * K
            el.size_x = d.length / 2
            el.rotation = Vector((1, 0, 0)).rotation_difference(d)
        el.stiffness = 2.0
    tmp = bpy.data.objects.new(name, mb); col.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get(); dg.update()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp, do_unlink=True); bpy.data.metaballs.remove(mb)
    p = v(*pivot)
    me.transform(Matrix.Translation(-p))
    me.name = name
    for poly in me.polygons: poly.use_smooth = True
    o = bpy.data.objects.new(name, me); o.location = p; col.objects.link(o)
    me.materials.append(mat(key, rough))
    if decimate < 1:
        d_ = o.modifiers.new('Decimate', 'DECIMATE'); d_.ratio = decimate
    return o

def sphere(name, center, radii, key, rough=0.8, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=v(*center), segments=20, ring_count=12, rotation=rot)
    o = bpy.context.active_object; o.name = name; o.data.name = name
    o.scale = [r * S for r in radii]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True); bpy.ops.object.shade_smooth()
    o.data.materials.append(mat(key, rough))
    for c in o.users_collection: c.objects.unlink(o)
    col.objects.link(o)
    return o

def parent(child, par):
    w = child.matrix_world.copy()
    child.parent = par
    child.matrix_world = w

# ---- body: long dachshund torso lying down, fluffy chest, short legs, feathered sides
body = blob('leah_body', [
    ('ell', (0, 0.13 + BACK / 2, 0.072), (0.078, 0.17 + BACK / 2, 0.062)),      # long torso
    ('ball', (0, 0.0, 0.085), 0.085),                      # chest
    ('ell', (0, -0.06, 0.07), (0.055, 0.045, 0.065)),      # chest fluff (bib)
    ('ball', (0, -0.085, 0.032), 0.034),                   # long chest hair between the paws
    ('ell', (0.05, -0.06, 0.042), (0.026, 0.05, 0.026)), ('ell', (-0.05, -0.06, 0.042), (0.026, 0.05, 0.026)),  # leg feathering
    ('ball', (0, -0.035, 0.15), 0.06),                     # neck
    ('ball', (0.055, 0.25 + BACK, 0.062), 0.062), ('ball', (-0.055, 0.25 + BACK, 0.062), 0.062),  # haunches
    ('ball', (0, 0.29 + BACK, 0.068), 0.062),              # rump
    ('cap', (0.048, -0.02, 0.026), (0.048, -0.13, 0.022), 0.026),   # front legs, stretched forward
    ('cap', (-0.048, -0.02, 0.026), (-0.048, -0.13, 0.022), 0.026),
    ('ell', (0.05, -0.155, 0.02), (0.028, 0.034, 0.02)), ('ell', (-0.05, -0.155, 0.02), (0.028, 0.034, 0.02)),  # front paws
    ('ell', (0.088, 0.19 + BACK, 0.02), (0.022, 0.035, 0.02)), ('ell', (-0.088, 0.19 + BACK, 0.02), (0.022, 0.035, 0.02)),  # hind paws, tucked
    ('ell', (0.072, 0.13 + BACK / 2, 0.045), (0.03, 0.14 + BACK / 2, 0.042)), ('ell', (-0.072, 0.13 + BACK / 2, 0.045), (0.03, 0.14 + BACK / 2, 0.042)),  # long-hair feathering
], 'coat', pivot=(0, 0, 0))

tail = blob('leah_tail', [
    ('ball', (0, 0.33 + BACK, 0.074), 0.03), ('ell', (0.008, 0.38 + BACK, 0.082), (0.036, 0.045, 0.032)),
    ('ell', (0.02, 0.43 + BACK, 0.08), (0.04, 0.046, 0.03)), ('ell', (0.03, 0.478 + BACK, 0.07), (0.032, 0.04, 0.022)),
], 'ear', pivot=(0, 0.325 + BACK, 0.072))

# ---- head: rounded skull, long dachshund muzzle, cheeks; pivot at the neck
head = blob('leah_head', [
    ('ell', (0, -0.07, 0.245), (0.068, 0.07, 0.065)),      # skull
    ('ell', (0, -0.155, 0.218), (0.034, 0.068, 0.032)),    # long muzzle
    ('ball', (0.033, -0.115, 0.212), 0.032), ('ball', (-0.033, -0.115, 0.212), 0.032),  # cheeks
    ('ell', (0, -0.06, 0.2), (0.055, 0.05, 0.04)),         # under the jaw
], 'coat', pivot=(0, -0.04, 0.17))

face = [
    sphere('leah_nose', (0, -0.22, 0.23), (0.019, 0.014, 0.015), 'nose', 0.3),
    sphere('leah_eye_l', (0.034, -0.128, 0.258), (0.013, 0.011, 0.014), 'eye', 0.2),
    sphere('leah_eye_r', (-0.034, -0.128, 0.258), (0.013, 0.011, 0.014), 'eye', 0.2),
    sphere('leah_shine_l', (0.038, -0.138, 0.264), (0.004, 0.003, 0.004), 'shine', 0.2),
    sphere('leah_shine_r', (-0.03, -0.138, 0.264), (0.004, 0.003, 0.004), 'shine', 0.2),
    sphere('leah_mouth', (0, -0.172, 0.199), (0.02, 0.03, 0.009), 'mouth', 0.6),
    sphere('leah_tongue', (0, -0.193, 0.187), (0.015, 0.021, 0.006), 'tongue', 0.5, rot=(math.radians(-25), 0, 0)),
]

# ---- ears: long, wavy, golden feathering hanging beside the face; pivot at the ear root
def ear(side):
    """Shorter, triangular ears: narrow at the root, twice as wide (front to back) at the tip."""
    s = side
    return blob(f'leah_ear_{"l" if s > 0 else "r"}', [
        ('ell', (s * 0.064, -0.058, 0.27), (0.018, 0.03, 0.024)),
        ('ell', (s * 0.073, -0.06, 0.236), (0.018, 0.038, 0.03)),
        ('ell', (s * 0.079, -0.058, 0.2), (0.019, 0.046, 0.032)),
        ('ell', (s * 0.081, -0.062, 0.165), (0.019, 0.054, 0.03)),
        ('ell', (s * 0.079, -0.06, 0.138), (0.017, 0.06, 0.022)),
    ], 'ear', pivot=(s * 0.058, -0.058, 0.288))
ear_l, ear_r = ear(1), ear(-1)

# ---- pink bow at the front of the neck
bow = [
    sphere('leah_bow_l', (0.033, -0.1, 0.128), (0.032, 0.013, 0.024), 'bow', 0.6, rot=(0, math.radians(-12), 0)),
    sphere('leah_bow_r', (-0.033, -0.1, 0.128), (0.032, 0.013, 0.024), 'bow', 0.6, rot=(0, math.radians(12), 0)),
    sphere('leah_bow_knot', (0, -0.108, 0.128), (0.014, 0.012, 0.015), 'bow', 0.6),
]

# ---- hierarchy
root = bpy.data.objects.new('leah', None); col.objects.link(root)
for o in (body, tail, head): parent(o, root)
for o in face + [ear_l, ear_r]: parent(o, head)
for o in bow: parent(o, body)

# ---- preview render (front three-quarter), then export
sc = bpy.context.scene
cd = bpy.data.cameras.new('leah_cam'); cd.lens = 70
cam = bpy.data.objects.new('leah_cam', cd); sc.collection.objects.link(cam)
target = v(0, 0.15, 0.12)
prev_cam, prev_res = sc.camera, (sc.render.resolution_x, sc.render.resolution_y)
hidden = []
for c in ('Atelier',):  # render her alone, on a plain floor
    pc = bpy.data.collections.get(c)
    if pc and not pc.hide_render: pc.hide_render = True; hidden.append(pc)
bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0)); floor = bpy.context.active_object
floor.data.materials.append(mat('chest', 0.9))
sun = bpy.data.objects.new('leah_sun', bpy.data.lights.new('leah_sun', 'SUN')); sun.data.energy = 3
sun.rotation_euler = (math.radians(50), 0, math.radians(30)); sc.collection.objects.link(sun)
sc.render.resolution_x, sc.render.resolution_y = 900, 700
for tag, pos in (('', (0.8, -1.0, 0.6)), ('-side', (1.6, 0.15, 0.4))):
    cam.location = pos
    cam.rotation_euler = (target - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    sc.render.filepath = f'{ROOT}/art/previews/leah{tag}.png'
    bpy.ops.render.render(write_still=True)
sc.camera = prev_cam; sc.render.resolution_x, sc.render.resolution_y = prev_res
for pc in hidden: pc.hide_render = False
bpy.data.objects.remove(floor, do_unlink=True); bpy.data.objects.remove(sun, do_unlink=True)
bpy.data.objects.remove(cam); bpy.data.cameras.remove(cd)

bpy.ops.object.select_all(action='DESELECT')
parts = [root] + list(root.children_recursive)
for o in parts: o.select_set(True)
glb = f'{ROOT}/public/clerk/leah.glb'
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                          export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
bpy.data.libraries.write(f'{ROOT}/art/leah.blend', set(parts) | {col}, fake_user=True, compress=True)
dg = bpy.context.evaluated_depsgraph_get()
faces = sum(len(o.evaluated_get(dg).data.polygons) for o in parts if o.type == 'MESH')
print('leah.glb bytes:', os.path.getsize(glb), '| faces:', faces)

# Leave the room file as it was.
for o in parts: bpy.data.objects.remove(o, do_unlink=True)
bpy.data.collections.remove(col)
