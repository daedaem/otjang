"""Tailored cloth surfaces adapted from the supplied sian4 garment construction.

Uses its shoulder/neck construction principles, meter UVs and broad folds;
not a scan, exact branded garment or a body-fit simulation.
"""
import math
from mathutils import Vector

TAU = math.tau


def mix(a, b, t):
    return a + (b - a) * t


def smooth(a, b, x):
    t = min(1., max(0., (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def B(p):
    return p[0], -p[2], p[1]


class Surface:
    def __init__(self, field=False):
        self.field = field
        self.length = .79 if field else .745
        self.shoulder = .252 if field else .24
        self.drop = .058 if field else .045
        self.neck = .088 if field else .075
        self.neck_depth = .049 if field else .37
        self.front_neck = .060 if field else .050
        self.back_neck = .035

    def width(self, t):
        chest, waist, hem = (.283, .269, .28) if self.field else (.264, .243, .261)
        return self.shoulder + (chest - self.shoulder) * smooth(.04, .3, t) + (waist - chest) * smooth(.3, .65, t) + (hem - waist) * smooth(.65, 1, t)

    def top(self, x, front=True):
        ax = abs(x)
        if ax >= self.neck:
            return -self.drop * min(1, (ax - self.neck) / (self.shoulder - self.neck))
        q = ax / self.neck
        if not front:
            return .004 * (1 - q * q)
        return -self.neck_depth * ((1 - q * q) if self.field else (1 - q) ** .88)

    def hem(self, x, front):
        return -self.length + (.048 * math.exp(-(x / .052) ** 2) if front and not self.field else 0)

    def depth(self, x, t, front=True):
        s = min(1, abs(x) / self.width(t))
        profile = max(0, 1 - s ** (2.7 if self.field else 3.0)) ** (1 / (2.7 if self.field else 3.0))
        chest, hem = ((.061, .051) if front else (.043, .036)) if self.field else ((.055, .044) if front else (.04, .031))
        edge = (self.front_neck if front else self.back_neck) * math.sqrt(max(0, 1 - (x / self.neck) ** 2))
        hanger = .027 * smooth(self.neck * .5, self.neck * 1.1, abs(x)) * math.sqrt(max(0, 1 - (1 - min(1, t / .053)) ** 2))
        base = mix(edge + hanger, mix(chest, hem, smooth(.4, 1, t)) * profile, smooth(.018, .19, t))
        # Centimetre-scale hanging folds, without high-frequency surface noise.
        phase = .7 if front else 2.3
        folds = (.009 if self.field else .004) * smooth(.18, .98, t) * (.65 * math.cos(TAU * x / .23 + phase) + .35 * math.cos(TAU * x / .16 + phase * .7)) * (1 - s ** 4)
        gather = .0022 * math.cos(TAU * x / .042) * math.exp(-((t - .55) / .065) ** 2) * (1 - s ** 4) if self.field else 0
        return (base + folds + gather) * (1 if front else -1)

    def front(self, x, z):
        top, hem = self.top(x), self.hem(x, True)
        t = min(1., max(0., (top - z) / max(.01, top - hem)))
        return self.depth(x, t)


def build_jacket(root, cloth, detail, hardware, mesh, curve, button, hanger, field=False):
    body = Surface(field)
    root['geometryVersion'] = 'tailored-panels-v2'
    root['fabricFamily'] = 'cotton-sateen' if field else 'wool-hopsack'
    for front in (True, False):
        ns, nt = 64, 54
        vertices, uv, faces = [], [], []
        for j in range(nt + 1):
            t = (j / nt) ** 1.45
            for i in range(ns + 1):
                x = (-1 + 2 * i / ns) * body.width(t)
                z = mix(body.top(x, front), body.hem(x, front), t)
                vertices.append(B((x, z, body.depth(x, t, front))))
                uv.append((x, z))
        for j in range(nt):
            for i in range(ns):
                a = j * (ns + 1) + i
                face = (a, a + ns + 1, a + ns + 2, a + 1)
                faces.append(face if front else face[::-1])
        mesh(('Sateen field' if field else 'Wool blazer') + (' front shell' if front else ' back shell'), vertices, faces, cloth, root, thickness=.0018, subsurf=1, uvs=uv)

    def patch(name, corners, off=.002, nu=14, nv=12, warp=None, mat=detail, thickness=.0012):
        vertices, faces, uv = [], [], []
        tl, tr, br, bl = corners
        for j in range(nv + 1):
            v = j / nv
            for i in range(nu + 1):
                u = i / nu
                x = mix(mix(tl[0], tr[0], u), mix(bl[0], br[0], u), v)
                z = mix(mix(tl[1], tr[1], u), mix(bl[1], br[1], u), v)
                if warp:
                    dx, dz = warp(u, v)
                    x += dx; z += dz
                lift = off(u, v) if callable(off) else off
                vertices.append(B((x, z, body.front(x, z) + lift)))
                uv.append((x, z))
        for j in range(nv):
            for i in range(nu):
                a = j * (nu + 1) + i
                face = (a, a + nu + 1, a + nu + 2, a + 1)
                faces.append(face if tr[0] >= tl[0] else face[::-1])
        return mesh(name, vertices, faces, mat, root, thickness=thickness, subsurf=1, uvs=uv)

    def front_button(name, x, z, size=.006, lift=.004):
        return button(name, B((x, z, body.front(x, z) + lift)), size, hardware, root)

    def line(name, points, radius=.0004, lift=.0025):
        return curve(name, [B((x, z, body.front(x, z) + lift)) for x, z in points], radius, detail, root)

    # Sleeve caps start within the shoulder seam and curve naturally downward.
    for side in (-1, 1):
        rw0, rw1, rd0, rd1 = (.097, .064, .047, .032) if field else (.087, .057, .04, .028)
        angle0 = math.atan2(body.drop, body.shoulder - body.neck) + .48
        p0 = Vector((side * (body.shoulder - rw0 * math.sin(angle0) - .003), -body.drop - rw0 * math.cos(angle0), .003))
        p1 = p0 + Vector((side * .076 * math.cos(angle0), -.076 * math.sin(angle0), .002))
        end_z = -body.drop - .59
        p2 = Vector((side * (body.shoulder + .042), mix(p0.y, end_z, .5), .016))
        p3 = Vector((side * (body.shoulder + .026), end_z, .03))
        vertices, faces, uv = [], [], []
        rows, cols = 44, 32
        def frame(t):
            center = p0 * (1-t)**3 + p1 * 3*(1-t)**2*t + p2 * 3*(1-t)*t*t + p3*t**3
            tangent = ((p1-p0)*3*(1-t)**2 + (p2-p1)*6*(1-t)*t + (p3-p2)*3*t*t).normalized()
            n1 = tangent.cross(Vector((0,0,1))).normalized()
            n2 = n1.cross(tangent).normalized()
            return center, n1, n2
        for j in range(rows + 1):
            t = j / rows
            center, n1, n2 = frame(t)
            rw = mix(rw0, rw1, smooth(.05, 1, t))
            rd = mix(mix(.012, rd0, smooth(0, .15, t)), rd1, smooth(.2, .9, t))
            if field:
                rw = mix(rw, rw1*.92, smooth(.9, .93, t))
            for i in range(cols + 1):
                theta = TAU * i / cols
                broad = (1 + (.075 if field else .025) * smooth(.15,.5,t) * (.65*math.cos(2*theta+.6+2*t)+.35*math.cos(4*theta-1.2*t)))
                elbow = (.018 if field else .009) * math.exp(-((t-.53)/.12)**2) * math.sin(t*TAU*7+theta*2)
                point = center + n1 * rw*math.cos(theta) + n2 * rd*(broad+elbow)*math.sin(theta)
                vertices.append(B(point))
                uv.append((i/cols * TAU * math.sqrt((rw*rw+rd*rd)/2), -t*.59))
        for j in range(rows):
            for i in range(cols):
                a=j*(cols+1)+i
                faces.append((a,a+cols+1,a+cols+2,a+1))
        mesh('Curved set-in sleeve '+str(side),vertices,faces,cloth,root,thickness=.0017,subsurf=1,uvs=uv)
        if not field:
            for i in range(3):
                t=.965-i*.025
                center,n1,n2=frame(t)
                point=center+n1*(side*.013)+n2*.031
                button('Understated cuff button',B(point),.0048,hardware,root)

    # A continuous collar band and a rolled leaf, rather than flat cut polygons.
    start,end=(math.pi/2-.16,math.pi/2+.16-TAU) if field else (.4,-math.pi-.4)
    for leaf in (False,True):
        vertices,faces,uv=[],[],[]
        cols,rows=64,8
        arc=0;previous=None
        for i in range(cols+1):
            theta=mix(start,end,i/cols);cs,sn=math.cos(theta),math.sin(theta)
            front=sn>0;x=body.neck*cs
            z=body.top(x,front);d=(body.front_neck if front else body.back_neck)*sn
            if previous:arc+=math.dist((x,z,d),previous)
            previous=(x,z,d)
            ox,od=cs/body.neck,sn/(body.front_neck if front else body.back_neck)
            norm=math.hypot(ox,od);ox/=norm;od/=norm
            for j in range(rows+1):
                t=j/rows
                if leaf:
                    spread=.007*math.sin(math.pi*t)+.009*t
                    px=x+ox*spread;pz=z+(.045 if field else .032)-(.014 if field else .046)*t
                    pd=d+od*spread
                else:
                    px=x+ox*.001;pz=z-.004+(.049 if field else .036)*t;pd=d+od*.001
                vertices.append(B((px,pz,pd)));uv.append((arc,t*.05))
        for i in range(cols):
            for j in range(rows):
                a=i*(rows+1)+j;faces.append((a,a+1,a+rows+2,a+rows+1))
        mesh(('Stand' if not leaf else 'Rolled collar fall')+' '+('field' if field else 'blazer'),vertices,faces,detail,root,thickness=.0017,subsurf=1,uvs=uv)

    if not field:
        # Narrow notched lapels with an actual soft roll over the front panels.
        x_v=lambda z:body.neck*(1-min(1,max(0,-z/.37))**(1/.88))
        for side in (-1,1):
            inner=(side*(x_v(-.076)-.004),-.076)
            notch=(inner[0]+side*.078,-.123)
            collar_tip=(inner[0]+side*.067,-.09)
            patch('Rolled notch lapel '+str(side),[inner,notch,(side*.012,-.377),(side*.003,-.363)],
                  off=lambda u,v:.003+.011*(1-u)**1.4*math.sin(math.pi*min(1,.15+v*.95)),nu=18,nv=32,
                  warp=lambda u,v:(side*.013*u*math.sin(math.pi*v**.8),0),thickness=.0016)
            patch('Upper gorge collar '+str(side),[(side*.067,.014),(side*.124,-.004),collar_tip,inner],
                  off=lambda u,v:.0045+.004*(1-u),nu=16,nv=14,thickness=.0016)
            # Blazer flap pockets sit over slits: there are no bulky utility bags.
            a,b=sorted((side*.072,side*.222))
            patch('Tailored lower pocket flap',[(a,-.475),(b,-.479),(b,-.522),(a,-.518)],off=lambda u,v:.002+.0025*v,nu=20,nv=8)
            line('Pocket welt seam',[(a,-.471),(b,-.475)],radius=.00055)
        patch('Slanted breast welt',[(.105,-.209),(.186,-.201),(.186,-.216),(.105,-.224)],off=.002,nu=14,nv=4)
        for z in (-.395,-.496):front_button('Brass blazer button',.016,z,.008,.004)
        line('Blazer front closure',[(.002,-.407),(.003,-.55),(.011,-.68)],radius=.0005,lift=.0018)
    else:
        patch('Soft storm placket',[(-.03,-.036),(.03,-.036),(.03,-.785),(-.03,-.785)],off=.0025,nu=8,nv=60)
        for i in range(5):front_button('Storm snap',0,-.109-i*.153,.006,.005)
        for side in (-1,1):
            for xa,xb,top,bottom,flap_height,bulge in [(.063,.20,-.203,-.357,.052,.003),(.059,.226,-.507,-.701,.061,.005)]:
                a,b=sorted((side*xa,side*xb))
                patch('Soft bellows pocket',[(a,top),(b,top),(b,bottom),(a,bottom)],
                      off=lambda u,v:.002+bulge*math.sin(math.pi*u)*math.sin(math.pi*v),nu=18,nv=20)
                patch('Curved pocket flap',[(a-.003,top+.009),(b+.003,top+.009),(b+.003,top-flap_height),(a-.003,top-flap_height)],
                      off=lambda u,v:.004+.002*v,nu=18,nv=8,warp=lambda u,v:(0,-.008*v*(1-abs(2*u-1))))
                front_button('Pocket snap',(a+b)/2,top-flap_height+.006,.0047,.009)
                line('Pocket stitched edge',[(a+.002,top-.03),(a+.002,bottom+.004),((a+b)/2,bottom+.002),(b-.002,bottom+.004),(b-.002,top-.03)],radius=.0003,lift=.003)
            a,b=sorted((side*.105,side*.23))
            patch('Soft shoulder epaulet',[(a,-.021),(b,-.061),(b,-.09),(a,-.053)],off=.0023,nu=16,nv=5)
            front_button('Epaulet snap',side*.12,-.043,.0045,.004)
        line('Waist drawcord seam',[(-.245,-.417),(-.12,-.424),(0,-.425),(.12,-.424),(.245,-.417)],radius=.00035,lift=.0018)
    hanger(root)
    return root
