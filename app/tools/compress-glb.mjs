// 옷·옷장 형태(glb)를 EXT_meshopt_compression으로 줄인다 (정점 값은 float 그대로, 순서만 바꾸고 압축). 파일 크기가 약 1/4이 된다.
// 사용: node tools/compress-glb.mjs    assets/closet-src/*.glb → assets/closet/*.glb   (npm i -D @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { reorder } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
for (const f of fs.readdirSync(path.join(root, 'assets/closet-src')).filter((n) => n.endsWith('.glb'))) {
  const src = path.join(root, 'assets/closet-src', f), dst = path.join(root, 'assets/closet', f);
  const doc = await io.read(src);
  // 양자화(KHR_mesh_quantization)는 쓰지 않는다: 흔들림 계산이 float 좌표를 그대로 쓰기 때문. 정점 순서만 바꾸고 meshopt 필터로 압축한다
  await doc.transform(reorder({ encoder: MeshoptEncoder, target: 'size' }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const out = await io.writeBinary(doc); fs.writeFileSync(dst, out);
  console.log(f, (fs.statSync(src).size / 1048576).toFixed(2), 'MB →', (out.byteLength / 1048576).toFixed(2), 'MB');
}
