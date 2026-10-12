-- 3D 형태에 스웻셔츠(크루넥)를 더한다 (앱 v0.4.2, 2026-10-12). 앱 wardrobe.js LOOK_KINDS, 서버 Vocab.LOOK_KINDS 와 같다.
alter table item drop constraint item_look3d_kind_check;
alter table item add constraint item_look3d_kind_check check (look3d_kind in ('shirt', 'blazer', 'field', 'trucker', 'sweat'));
