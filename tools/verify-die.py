"""Verify landing rotations against the imported mesh and count pips in its texture."""
import struct,json,math,collections,zlib,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
b=(root/'dist/dice.glb').read_bytes();l=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+l]);data=b[28+l:]
def arr(i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];size={'VEC3':3,'VEC2':2,'SCALAR':1}[a['type']];f={5126:'f',5123:'H'}[a['componentType']];sz=struct.calcsize(f)*size;off=v.get('byteOffset',0)+a.get('byteOffset',0)
 return [struct.unpack_from('<'+f*size,data,off+k*sz) for k in range(a['count'])]
p,n,u,idx=[arr(i) for i in range(4)];idx=[x[0] for x in idx]
def cross(a,b):return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def sub(a,b):return tuple(a[i]-b[i] for i in range(3))
def dot(a,b):return sum(a[i]*b[i] for i in range(3))
norms=collections.defaultdict(lambda:[0,0])
for z in range(0,len(idx),3):
 t=idx[z:z+3];a,b,c=[p[x] for x in t];norm=cross(sub(b,a),sub(c,a));length=math.sqrt(dot(norm,norm));norm=tuple(x/length for x in norm);key=tuple(round(x,3) for x in norm);norms[key][0]+=length/2;norms[key][1]+=1

axes=[(-math.cos(math.radians(22)),0,math.sin(math.radians(22))),(0,-1,0),(math.sin(math.radians(22)),0,math.cos(math.radians(22))),(-math.sin(math.radians(22)),0,-math.cos(math.radians(22))),(0,1,0),(math.cos(math.radians(22)),0,-math.sin(math.radians(22)))]
faceNormals={}
print('Measured die faces:')
for number,axis in enumerate(axes,1):
 area=0;ns=[0,0,0];coords=[]
 for z in range(0,len(idx),3):
  t=idx[z:z+3];ps=[p[x] for x in t];norm=cross(sub(ps[1],ps[0]),sub(ps[2],ps[0]));length=math.sqrt(dot(norm,norm));nn=tuple(x/length for x in norm)
  if dot(nn,axis)>.999999:
   area+=length/2
   ns=[ns[k]+norm[k] for k in range(3)]
   coords.extend(u[i] for i in t)
 length=math.sqrt(dot(ns,ns));normal=[x/length for x in ns];faceNormals[number]=normal
 print(number,'normal',normal,'area',area,'uv_bounds',min(x[0] for x in coords),max(x[0] for x in coords),min(x[1] for x in coords),max(x[1] for x in coords))
source=(root/'dist/app.js').read_text()
block=re.search(r'const landingAngles = \{(.*?)\n  \};',source,re.S).group(1)
angles={int(k):[float(n) for n in v.split(',')] for k,v in re.findall(r'(\d): \[([^\]]+)\]',block)}
assert set(angles)==set(range(1,7)), 'Missing landing pose'
print('\nTransformed normals:')
for no,ns in faceNormals.items():
 z,x,y=[math.radians(v) for v in angles[no]];a,b,c=ns
 a,b,c=a*math.cos(z)-b*math.sin(z),a*math.sin(z)+b*math.cos(z),c
 a,b,c=a,b*math.cos(x)-c*math.sin(x),b*math.sin(x)+c*math.cos(x)
 a,b,c=a*math.cos(y)+c*math.sin(y),b,-a*math.sin(y)+c*math.cos(y)
 error=math.sqrt(a*a+(b-1)**2+c*c)
 assert error<1e-6, f'Face {no} points in the wrong direction: {error}'
 print(no,'upward normal verified; error',error)
# Decode embedded PNG using the standard library only and count light pip regions.
v=j['bufferViews'][5];png=data[v['byteOffset']:v['byteOffset']+v['byteLength']]
o=8;packed=b''
while o<len(png):
 l=struct.unpack_from('>I',png,o)[0];t=png[o+4:o+8];chunk=png[o+8:o+8+l];o+=l+12
 if t==b'IHDR':w,h,bit,color,*rest=struct.unpack('>IIBBBBB',chunk)
 if t==b'IDAT':packed+=chunk
raw=zlib.decompress(packed);bpp={2:3,6:4}[color];stride=w*bpp;rows=[];prev=bytearray(stride);o=0
for yy in range(h):
 filt=raw[o];o+=1;row=bytearray(raw[o:o+stride]);o+=stride
 for xx in range(stride):
  left=row[xx-bpp] if xx>=bpp else 0;up=prev[xx];ul=prev[xx-bpp] if xx>=bpp else 0
  if filt==1:predict=left
  elif filt==2:predict=up
  elif filt==3:predict=(left+up)//2
  elif filt==4:
   pp=left+up-ul;aa=abs(pp-left);bb=abs(pp-up);cc=abs(pp-ul);predict=left if aa<=bb and aa<=cc else (up if bb<=cc else ul)
  else:predict=0
  row[xx]=(row[xx]+predict)&255
 rows.append(row);prev=row
print('\nTexture pip counts from isolated atlas face regions:')
for no,axis in enumerate(axes,1):
 coords=[]
 for z in range(0,len(idx),3):
  t=idx[z:z+3];a,b,c=[p[x] for x in t];norm=cross(sub(b,a),sub(c,a));ln=math.sqrt(dot(norm,norm));nn=tuple(x/ln for x in norm)
  if dot(nn,axis)>.999999:coords.extend(u[i] for i in t)
 x0=math.ceil(min(x[0] for x in coords)*w);x1=math.floor(max(x[0] for x in coords)*w);y0=math.ceil(min(x[1] for x in coords)*h);y1=math.floor(max(x[1] for x in coords)*h)
 white=set()
 for yy in range(y0,y1):
  for xx in range(x0,x1):
   rgb=rows[yy][xx*bpp:xx*bpp+3]
   if min(rgb)>180 and max(rgb)-min(rgb)<30:white.add((xx,yy))
 comps=[]
 while white:
  seed=white.pop();todo=[seed];sz=1
  while todo:
   xx,yy=todo.pop()
   for q in ((xx-1,yy),(xx+1,yy),(xx,yy-1),(xx,yy+1)):
    if q in white:white.remove(q);todo.append(q);sz+=1
  if sz>500:comps.append(sz)
 assert len(comps)==no, f'Face {no} texture has {len(comps)} pips'
 print(no,'texture pip count verified')

print('All six outcomes match the model geometry and texture.')
