// Pages로 올릴 때의 /api/catalog/* 입구. Workers로 올리면 worker.js가 같은 처리기를 부른다.
import { handleCatalog } from '../catalog.js';

export const onRequest = ({ request, env }) => handleCatalog(request, env);
