# Pawp Atelier - graybox room (cartoon blockout). Meters, Z up (Blender). Camera views from +X/-Y.
import bpy, math
from mathutils import Vector

# ---- reset scene
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections): bpy.data.collections.remove(c)
for m in list(bpy.data.materials): bpy.data.materials.remove(m)
for me in list(bpy.data.meshes): bpy.data.meshes.remove(me)
scene = bpy.context.scene
root = bpy.data.collections.new('Atelier'); scene.collection.children.link(root)
cols = {}
def col(name):
    if name not in cols:
        c = bpy.data.collections.new(name); root.children.link(c); cols[name] = c
    return cols[name]

# ---- palette (cartoon, flat)
PAL = {
 'wall': '#F6EFE6', 'wall2': '#EFE3D0', 'floor': '#E2C29F', 'wood': '#C99A6B', 'wood_dark': '#9B6B47',
 'pink': '#D9607F', 'pink_soft': '#F4B6C6', 'sage': '#9BBF9A', 'cream': '#FFF8EE', 'white': '#FFFFFF',
 'glass': '#CFE8FF', 'ink': '#3B2F2F', 'brass': '#D8B46A', 'rug': '#F7D9C4', 'bed': '#F59AB5', 'cushion': '#FFE4EC', 'linen': '#E6D5BC',
}
def hex2rgb(h):
    h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) / 255 for i in (0, 2, 4))
mats = {}
def mat(key):
    if key not in mats:
        m = bpy.data.materials.new('M_' + key)
        m.use_nodes = True
        b = m.node_tree.nodes['Principled BSDF']
        r, g, bl = hex2rgb(PAL[key])
        # sRGB hex -> linear for the shader
        lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
        b.inputs['Base Color'].default_value = (lin(r), lin(g), lin(bl), 1)
        b.inputs['Roughness'].default_value = 0.85
        if key == 'glass':
            b.inputs['Alpha'].default_value = 0.35
        mats[key] = m
    return mats[key]

def box(name, size, loc, key, collection='Room', bevel=0.02, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        m = o.modifiers.new('Bevel', 'BEVEL'); m.width = bevel; m.segments = 3; m.limit_method = 'ANGLE'
    o.data.materials.append(mat(key))
    for c in o.users_collection: c.objects.unlink(o)
    col(collection).objects.link(o)
    return o

def cyl(name, r, h, loc, key, collection='Room', verts=24, bevel=0.01, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, vertices=verts, rotation=rot)
    o = bpy.context.active_object; o.name = name
    if bevel:
        m = o.modifiers.new('Bevel', 'BEVEL'); m.width = bevel; m.segments = 2; m.limit_method = 'ANGLE'
    bpy.ops.object.shade_smooth()
    o.data.materials.append(mat(key))
    for c in o.users_collection: c.objects.unlink(o)
    col(collection).objects.link(o)
    return o

def empty(name, loc, collection='Markers', kind='PLAIN_AXES', size=0.12, rot=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = kind; e.empty_display_size = size
    e.location = loc; e.rotation_euler = rot
    col(collection).objects.link(e)
    return e

# ---- shell: floor + back wall (along X at y=+2) + left wall (along Y at x=-2.2)
W, D, H = 4.4, 4.0, 2.7
box('floor', (W, D, 0.12), (0, 0, -0.06), 'floor', bevel=0.03)
box('wall_back', (W, 0.14, H), (0, D/2 + 0.07, H/2), 'wall', bevel=0.02)
box('wall_left', (0.14, D, H), (-W/2 - 0.07, 0, H/2), 'wall2', bevel=0.02)
box('baseboard_back', (W, 0.04, 0.1), (0, D/2 - 0.02, 0.05), 'wood')
box('baseboard_left', (0.04, D, 0.1), (-W/2 + 0.02, 0, 0.05), 'wood')
box('rug', (2.0, 1.4, 0.015), (0.2, -0.2, 0.008), 'rug', bevel=0.006)

# ---- window (back wall, right of center)
wx, wz = 0.55, 1.55
box('window_frame', (1.1, 0.06, 1.05), (wx, D/2 - 0.01, wz), 'wood', bevel=0.02)
box('window_glass', (0.95, 0.03, 0.9), (wx, D/2 - 0.04, wz), 'glass', bevel=0)
box('window_bar_v', (0.04, 0.05, 0.92), (wx, D/2 - 0.05, wz), 'wood', bevel=0.006)
box('window_bar_h', (0.95, 0.05, 0.04), (wx, D/2 - 0.05, wz), 'wood', bevel=0.006)
box('window_sill', (1.25, 0.18, 0.05), (wx, D/2 - 0.1, wz - 0.55), 'wood', bevel=0.012)
cyl('plant_pot', 0.08, 0.12, (wx + 0.42, D/2 - 0.1, wz - 0.46), 'pink', collection='Props')
bpy.ops.mesh.primitive_ico_sphere_add(radius=0.12, subdivisions=1, location=(wx + 0.42, D/2 - 0.1, wz - 0.3))
leaf = bpy.context.active_object; leaf.name = 'plant_leaves'; leaf.data.materials.append(mat('sage'))
for c in leaf.users_collection: c.objects.unlink(leaf)
col('Props').objects.link(leaf)

# ---- zone: drinkware shelves (back wall, left)
sx = -1.1
for i, z in enumerate((0.95, 1.3, 1.65)):
    box(f'shelf_{i}', (1.3, 0.26, 0.05), (sx, D/2 - 0.13, z), 'wood', bevel=0.012)
    for side in (-1, 1):
        box(f'shelf_{i}_bracket_{side}', (0.04, 0.2, 0.12), (sx + side * 0.55, D/2 - 0.1, z - 0.08), 'wood_dark', bevel=0.008)
box('shelf_sign', (0.6, 0.03, 0.16), (sx, D/2 - 0.015, 2.0), 'pink', bevel=0.02)

# ---- zone: accessory type-case cabinet (back wall, right)
cx = 1.65
box('cabinet', (0.95, 0.5, 1.05), (cx, D/2 - 0.26, 0.525), 'wood', bevel=0.02)
for r in range(4):
    for c in range(3):
        box(f'drawer_{r}_{c}', (0.27, 0.03, 0.2), (cx - 0.3 + c * 0.3, D/2 - 0.52, 0.18 + r * 0.24), 'cream', bevel=0.01)
        cyl(f'drawer_{r}_{c}_knob', 0.018, 0.03, (cx - 0.3 + c * 0.3, D/2 - 0.55, 0.18 + r * 0.24), 'brass', verts=10, bevel=0, rot=(math.pi/2, 0, 0))
box('cabinet_top_tray', (0.7, 0.32, 0.04), (cx, D/2 - 0.3, 1.07), 'cream', bevel=0.01)

# ---- zone: apparel corner (left wall)
ax, ay = -1.75, 0.55
def link_to(o, collection):
    for c in o.users_collection: c.objects.unlink(o)
    col(collection).objects.link(o)

def loft(name, rings, key, at, collection='Room', segs=32, cap_bottom=False, cap_top=False, subsurf=1):
    """A smooth body from horizontal rings (z, half-width, half-depth, squareness, y-offset),
    each a superellipse; squareness 2 = ellipse, higher = boxier (shoulders)."""
    verts, faces = [], []
    for z, a, b, n, cy in rings:
        for i in range(segs):
            t = 2 * math.pi * i / segs
            c, s_ = math.cos(t), math.sin(t)
            x = a * math.copysign(abs(c) ** (2 / n), c)
            y = b * math.copysign(abs(s_) ** (2 / n), s_)
            verts.append((at[0] + x, at[1] + y + cy, z))
    for r in range(len(rings) - 1):
        for i in range(segs):
            j = (i + 1) % segs
            faces.append((r * segs + i, r * segs + j, (r + 1) * segs + j, (r + 1) * segs + i))
    if cap_bottom: faces.append(tuple(reversed(range(segs))))
    if cap_top: faces.append(tuple((len(rings) - 1) * segs + i for i in range(segs)))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    o = bpy.data.objects.new(name, me); col(collection).objects.link(o)
    for poly in me.polygons: poly.use_smooth = True
    if subsurf:
        m = o.modifiers.new('Subsurf', 'SUBSURF'); m.levels = subsurf; m.render_levels = subsurf
    o.data.materials.append(mat(key))
    return o

def rod(name, p0, p1, r, key, collection='Room', verts=12):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d.length, location=(p0 + p1) / 2, vertices=verts)
    o = bpy.context.active_object; o.name = name
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d)
    bpy.ops.object.shade_smooth(); o.data.materials.append(mat(key)); link_to(o, collection)
    return o

def blob(name, r, loc, scale, key, collection='Room'):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=16, ring_count=8)
    o = bpy.context.active_object; o.name = name; o.scale = scale
    bpy.ops.object.transform_apply(scale=True); bpy.ops.object.shade_smooth()
    o.data.materials.append(mat(key)); link_to(o, collection)
    return o

# Dress form: tripod stand, brass column, shaped linen torso (front faces -Y), wooden neck cap.
hub_z = 0.42
cyl('dressform_hub', 0.035, 0.07, (ax, ay, hub_z), 'wood_dark', verts=16)
for k in range(3):
    t = math.radians(90 + k * 120)
    rod(f'dressform_leg_{k}', (ax, ay, hub_z), (ax + 0.24 * math.cos(t), ay + 0.24 * math.sin(t), 0.015), 0.014, 'wood_dark')
    blob(f'dressform_foot_{k}', 0.022, (ax + 0.245 * math.cos(t), ay + 0.245 * math.sin(t), 0.015), (1, 1, 0.6), 'wood_dark')
cyl('dressform_pole', 0.014, 0.6, (ax, ay, hub_z + 0.3), 'brass', verts=10, bevel=0)
TORSO = [  # z, half-width, half-depth, squareness, y-offset (negative = forward)
    (0.965, 0.115, 0.085, 2.0, 0), (0.99, 0.155, 0.112, 2.2, 0), (1.05, 0.170, 0.120, 2.2, 0),
    (1.13, 0.138, 0.100, 2.0, 0), (1.20, 0.140, 0.102, 2.0, -0.005), (1.28, 0.163, 0.118, 2.2, -0.012),
    (1.35, 0.170, 0.112, 2.4, -0.008), (1.41, 0.172, 0.100, 2.8, 0), (1.445, 0.150, 0.088, 2.8, 0),
    (1.465, 0.105, 0.070, 2.4, 0), (1.477, 0.055, 0.050, 2.0, 0), (1.52, 0.047, 0.044, 2.0, 0), (1.53, 0.040, 0.038, 2.0, 0),
]
loft('dressform_torso', TORSO, 'linen', (ax, ay), cap_bottom=True, cap_top=True)
cyl('dressform_cap', 0.034, 0.025, (ax, ay, 1.54), 'wood_dark', verts=16, bevel=0.006)
blob('dressform_cap_knob', 0.014, (ax, ay, 1.562), (1, 1, 1), 'wood_dark')

# A display tee dressed on the form: a loose shell, short sleeves, crew collar and a paw print.
TEE = [
    (1.02, 0.183, 0.133, 2.3, 0), (1.06, 0.184, 0.132, 2.2, 0), (1.13, 0.166, 0.122, 2.1, 0),
    (1.20, 0.161, 0.120, 2.1, -0.005), (1.28, 0.177, 0.131, 2.2, -0.012), (1.35, 0.183, 0.125, 2.4, -0.008),
    (1.41, 0.185, 0.113, 2.8, 0), (1.445, 0.163, 0.101, 2.8, 0), (1.466, 0.117, 0.081, 2.4, 0), (1.476, 0.072, 0.063, 2.0, 0),
]
loft('dressform_tee', TEE, 'white', (ax, ay))
bpy.ops.mesh.primitive_torus_add(major_radius=0.068, minor_radius=0.008, location=(ax, ay, 1.476), major_segments=32, minor_segments=8)
collar = bpy.context.active_object; collar.name = 'dressform_tee_collar'; collar.scale = (1, 0.87, 1)
bpy.ops.object.transform_apply(scale=True); bpy.ops.object.shade_smooth(); collar.data.materials.append(mat('white')); link_to(collar, 'Room')
for side in (-1, 1):
    a = math.radians(40)  # sleeve hangs 40 degrees below horizontal
    d = Vector((side * math.cos(a), 0, -math.sin(a)))
    root_ = Vector((ax + side * 0.13, ay, 1.405))
    bpy.ops.mesh.primitive_cone_add(radius1=0.07, radius2=0.062, depth=0.15, vertices=24, end_fill_type='NGON',
                                    location=root_ + d * 0.075, rotation=(0, -side * math.radians(50), 0))
    sl = bpy.context.active_object; sl.name = f'dressform_tee_sleeve_{"l" if side < 0 else "r"}'; sl.scale = (1, 0.85, 1)
    bpy.ops.object.transform_apply(scale=True); bpy.ops.object.shade_smooth(); sl.data.materials.append(mat('white')); link_to(sl, 'Room')
# Paw print on the chest (pad + four toe beans), sunk slightly into the tee's front.
fy = ay - 0.143
blob('dressform_tee_paw_pad', 0.03, (ax, fy, 1.27), (1, 0.25, 0.85), 'pink')
for i, (dx, dz) in enumerate(((-0.036, 0.03), (-0.013, 0.048), (0.013, 0.048), (0.036, 0.03))):
    blob(f'dressform_tee_paw_toe_{i}', 0.012, (ax + dx, fy + 0.002 + abs(dx) * 0.12, 1.27 + dz), (1, 0.3, 1.15), 'pink')
box('pegboard', (0.04, 1.0, 0.7), (-W/2 + 0.03, -0.55, 1.6), 'cream', bevel=0.01)
for i in range(3):
    cyl(f'peg_hook_{i}', 0.015, 0.12, (-W/2 + 0.1, -0.85 + i * 0.3, 1.8), 'brass', verts=8, bevel=0, rot=(0, math.pi/2, 0))

# ---- workbench (customizing stage), center
bx, by = -0.45, 0.35
box('workbench_top', (1.5, 0.75, 0.08), (bx, by, 0.9), 'wood', bevel=0.02)
for dx in (-0.65, 0.65):
    for dy in (-0.3, 0.3):
        box(f'workbench_leg_{dx}_{dy}', (0.07, 0.07, 0.86), (bx + dx, by + dy, 0.43), 'wood_dark', bevel=0.01)
box('workbench_shelf', (1.4, 0.65, 0.04), (bx, by, 0.25), 'wood', bevel=0.01)
box('cutting_mat', (0.6, 0.42, 0.012), (bx, by - 0.05, 0.946), 'sage', bevel=0.004)
cyl('pencil_cup', 0.05, 0.12, (bx + 0.55, by + 0.2, 1.0), 'pink', collection='Props')

# ---- Leah's desk (order counter): right side near the entrance, turned to face the room
kx, ky = 1.75, -0.9
krot = (0, 0, math.radians(90))
box('desk', (1.2, 0.6, 0.95), (kx, ky, 0.475), 'pink_soft', bevel=0.03, rot=krot)
box('desk_top', (1.3, 0.7, 0.06), (kx, ky, 0.98), 'wood', bevel=0.02, rot=krot)
# Counter layout (seen from the room camera, +X/-Y): product spot in the middle, register
# front-left, bell front-right, Leah lying at the back (her body reaches back toward -X/+Y).
rx, ry = kx - 0.18, ky - 0.42
box('register', (0.26, 0.32, 0.16), (rx, ry, 1.09), 'cream', bevel=0.03, rot=(0, 0, 0))
box('register_screen', (0.03, 0.2, 0.1), (rx - 0.11, ry, 1.2), 'ink', bevel=0.01, rot=(0, math.radians(20), 0))
box('desk_sign', (0.03, 0.42, 0.12), (kx - 0.36, ky + 0.2, 0.78), 'pink', bevel=0.02)
cyl('bell', 0.05, 0.05, (kx + 0.22, ky - 0.3, 1.04), 'brass', verts=16, collection='Props')
box('stool_seat', (0.36, 0.36, 0.06), (kx + 0.0, ky - 1.05, 0.62), 'pink', bevel=0.025, collection='Props')
cyl('stool_leg', 0.03, 0.6, (kx + 0.0, ky - 1.05, 0.3), 'wood_dark', verts=10, collection='Props')

# ---- cozy props: pendant lamp over the workbench, picture frames on the left wall
cyl('lamp_cord', 0.006, 0.9, (-0.45, 0.35, 2.25), 'ink', verts=6, bevel=0, collection='Props')
bpy.ops.mesh.primitive_cone_add(radius1=0.22, radius2=0.06, depth=0.2, location=(-0.45, 0.35, 1.72), vertices=24)
shade = bpy.context.active_object; shade.name = 'lamp_shade'; bpy.ops.object.shade_smooth(); shade.data.materials.append(mat('sage'))
for c in shade.users_collection: c.objects.unlink(shade)
col('Props').objects.link(shade)
for i, (fy, fz, fw, fh) in enumerate(((0.95, 1.95, 0.34, 0.42), (1.45, 1.7, 0.28, 0.28), (1.5, 2.15, 0.22, 0.26))):
    box(f'frame_{i+1}', (0.04, fw, fh), (-W/2 + 0.02, fy, fz), 'wood', bevel=0.012)
    box(f'frame_{i+1}_photo', (0.02, fw - 0.06, fh - 0.06), (-W/2 + 0.045, fy, fz), 'cream', bevel=0)
    empty(f'photo_frame_{i+1}', (-W/2 + 0.06, fy, fz), kind='PLAIN_AXES', size=0.1)

# ---- pet corner (front left): round dog bed
px, py = -1.4, -1.25
cyl('petbed_base', 0.42, 0.14, (px, py, 0.07), 'bed', verts=32, bevel=0.05)
cyl('petbed_cushion', 0.33, 0.06, (px, py, 0.15), 'cushion', verts=32, bevel=0.025)
bpy.ops.mesh.primitive_torus_add(major_radius=0.4, minor_radius=0.08, location=(px, py, 0.2))
rim = bpy.context.active_object; rim.name = 'petbed_rim'; bpy.ops.object.shade_smooth(); rim.data.materials.append(mat('bed'))
for c in rim.users_collection: c.objects.unlink(rim)
col('Room').objects.link(rim)
box('pet_corner_sign', (0.03, 0.4, 0.14), (-W/2 + 0.02, py, 0.6), 'pink', bevel=0.02)

# ---- markers (named empties the app reads). Positions are where the item's base sits.
D2 = D/2
empty('zone_drinkware', (sx, D2 - 0.6, 1.3), kind='SPHERE', size=0.2)
empty('slot_mug_1', (sx - 0.3, D2 - 0.13, 1.355), kind='SINGLE_ARROW')
empty('slot_tumbler_1', (sx + 0.3, D2 - 0.13, 0.975), kind='SINGLE_ARROW')
empty('zone_apparel', (-1.95, -0.1, 1.35), kind='SPHERE', size=0.2)
empty('slot_tee_1', (ax, ay, 1.28), kind='SINGLE_ARROW')
# The tee product hangs from the middle peg (marker = the bottom of the shirt: 28 in below the hook).
empty('slot_tee_peg', (-W/2 + 0.08, -0.55, 1.8 - 0.712), kind='SINGLE_ARROW')
empty('zone_accessories', (cx, D2 - 0.9, 1.0), kind='SPHERE', size=0.2)
empty('slot_case_iphone', (cx - 0.15, D2 - 0.3, 1.09), kind='SINGLE_ARROW')
empty('slot_case_galaxy', (cx + 0.15, D2 - 0.3, 1.09), kind='SINGLE_ARROW')
empty('workbench', (bx, by - 0.05, 0.952), kind='CUBE', size=0.15)
empty('counter', (kx - 0.02, ky - 0.12, 1.01), kind='CUBE', size=0.15)
# Leah lies on the counter, behind where the finished product is set down.
empty('clerk', (kx + 0.18, ky + 0.12, 1.01), kind='SINGLE_ARROW', size=0.3)
empty('pet_corner', (px, py, 0.18), kind='SINGLE_ARROW', size=0.3)

# ---- preview-only product stand-ins (real products come from the app; never exported)
def ghost(name, kind, size, at, key='white'):
    e = bpy.data.objects[at]
    if kind == 'cyl':
        o = cyl(name, size[0], size[1], (e.location.x, e.location.y, e.location.z + size[1] / 2), key, collection='Preview', verts=24)
    else:
        o = box(name, size, (e.location.x, e.location.y, e.location.z + size[2] / 2), key, collection='Preview', bevel=0.01)
    return o
ghost('ghost_mug', 'cyl', (0.041, 0.096), 'slot_mug_1')
ghost('ghost_tumbler', 'cyl', (0.037, 0.21), 'slot_tumbler_1', key='cream')
ghost('ghost_case_iphone', 'box', (0.075, 0.15, 0.012), 'slot_case_iphone', key='pink')
ghost('ghost_case_galaxy', 'box', (0.077, 0.16, 0.012), 'slot_case_galaxy', key='sage')
bpy.ops.mesh.primitive_cube_add(size=1, location=(ax, ay - 0.02, 1.32))
tee = bpy.context.active_object; tee.name = 'ghost_tee'; tee.scale = (0.5, 0.32, 0.62); bpy.ops.object.transform_apply(scale=True)
tee.data.materials.append(mat('pink_soft'))
for c in tee.users_collection: c.objects.unlink(tee)
col('Preview').objects.link(tee)

# ---- camera shots (cameras named cam_*; the app reads their transforms)
def cam(name, loc, target, lens=35):
    c = bpy.data.cameras.new(name); c.lens = lens
    o = bpy.data.objects.new(name, c); o.location = loc
    d = Vector(target) - Vector(loc)
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    col('Cameras').objects.link(o)
    return o
room_target = (0.0, 0.4, 0.85)
empty('room_target', room_target, kind='SPHERE', size=0.25)
cam('cam_room_landscape', (5.4, -5.6, 3.6), room_target, lens=35)
cam('cam_room_portrait', (4.3, -4.7, 3.4), (0.0, 0.35, 0.75), lens=24)
scene.camera = bpy.data.objects['cam_room_landscape']

# ---- lighting for preview renders (the real look will be baked later)
sun_data = bpy.data.lights.new('sun', 'SUN'); sun_data.energy = 2.5; sun_data.angle = math.radians(12)
sun = bpy.data.objects.new('sun', sun_data); sun.rotation_euler = (math.radians(55), math.radians(-10), math.radians(30))
col('Lights').objects.link(sun)
win = bpy.data.lights.new('window_light', 'AREA'); win.energy = 220; win.size = 1.0; win.color = (1.0, 0.93, 0.82)
wo = bpy.data.objects.new('window_light', win); wo.location = (wx, D2 - 0.4, wz); wo.rotation_euler = (math.radians(90), 0, 0)
col('Lights').objects.link(wo)
world = scene.world or bpy.data.worlds.new('World'); scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.95, 0.88, 0.80, 1); bg.inputs['Strength'].default_value = 1.0
lampl = bpy.data.lights.new('lamp_light', 'POINT'); lampl.energy = 60; lampl.color = (1.0, 0.85, 0.65); lampl.shadow_soft_size = 0.3
lo = bpy.data.objects.new('lamp_light', lampl); lo.location = (-0.45, 0.35, 1.55); col('Lights').objects.link(lo)

print('objects:', len(bpy.data.objects), '| tris approx:', sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH'))
