-- 앱 0.5.0-beta (2026-10-12): 원피스(dress) 분류, 결정 2주 뒤 물음(follow)의 답.
-- 종류(kind)·색 계열(family)은 DB 제약 없이 Vocab(Java)과 wardrobe.js(앱)가 정리하므로, 새 종류(스커트·블라우스·힐 …)와 새 색(핑크·퍼플·옐로·오렌지)은 마이그레이션이 필요 없다.
alter table item drop constraint item_cat_check;
alter table item add constraint item_cat_check check (cat in ('outer', 'top', 'bottom', 'dress', 'shoes'));
alter table catalog_product drop constraint catalog_product_cat_check;
alter table catalog_product add constraint catalog_product_cat_check check (cat in ('outer', 'top', 'bottom', 'dress', 'shoes'));

alter table decision add column follow_at date;
alter table decision add column follow_worn text check (follow_worn in ('', 'none', 'few', 'many', 'notbought'));
alter table decision add column follow_feel text check (follow_feel in ('', 'good', 'ok', 'regret'));
alter table decision add constraint decision_follow_all_or_none check ((follow_at is null) = (follow_worn is null) and (follow_at is null) = (follow_feel is null));
alter table decision add constraint decision_follow_after_decided check (follow_at is null or after_decision in ('buy', 'skip'));
comment on column decision.follow_at is '결정 2주 뒤 물음에 답한 날. 산다: follow_worn(none·few·many·notbought)과 follow_feel(good·ok·regret, 결국 안 샀으면 빈 값). 안 산다: follow_worn 빈 값, follow_feel 만';
