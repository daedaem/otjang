-- 3D 형태에 카디건(V넥)을 더한다 (앱 v0.4.4, 2026-10-12).
alter table item drop constraint item_look3d_kind_check;
alter table item add constraint item_look3d_kind_check check (look3d_kind in ('shirt', 'blazer', 'field', 'trucker', 'sweat', 'cardigan'));
