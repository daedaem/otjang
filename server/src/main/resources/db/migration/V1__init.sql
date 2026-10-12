-- 옷장들이(가칭) 서버 v0.1 — 첫 스키마. 개인판 앱의 옷장 파일(스키마 2)과 상품 목록(스키마 1)을 그대로 담는다.
-- 원칙: 앱의 정리 규칙(cleanItem)이 지키는 불변식을 DB 제약으로도 지킨다. 사진 바이트는 DB 밖(PhotoStore, 비공개 로컬 폴더)에 두고 여기에는 참조 키만 둔다.
-- PostgreSQL 16 에서 2026-10-12 적용 확인.

create table owner (
    id          bigserial primary key,
    nickname    text        not null default '',
    height      numeric(5, 1) check (height between 100 and 230),
    top_size    text        not null default '',
    bottom_size text        not null default '',
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
comment on table owner is '옷장 주인. 지금은 로컬 한 사람(id 1). 여러 사용자는 owner 단위로 나눌 수 있게 모든 표에 owner_id 를 둔다';

-- 로컬 개인판: 주인 한 사람을 미리 만든다
insert into owner (nickname) values ('');

create table item (
    id                   bigserial primary key,
    owner_id             bigint      not null references owner (id) on delete cascade,
    client_id            text        not null,
    status               text        not null check (status in ('owned', 'candidate', 'gone')),
    cat                  text        not null check (cat in ('outer', 'top', 'bottom', 'shoes')),
    kind                 text        not null,
    name                 text        not null,
    detail               text        not null default '',
    family               text        not null,
    light                smallint    not null check (light between 0 and 100),
    formality            smallint    not null check (formality between 1 and 3),
    pattern              text        not null check (pattern in ('solid', 'stripe', 'check', 'graphic')),
    seasons              text[]      not null default '{}',
    attr_source          text        not null check (attr_source in ('photo-draft', 'owner', 'owner-confirmed')),
    draft_note           text        not null default '',
    photo_kind           text        not null check (photo_kind in ('own', 'confirmed', 'candidate', 'substitute', 'none')),
    photo_img_ref        text        not null default '',
    photo_own_img_ref    text        not null default '',
    photo_source_name    text        not null default '',
    photo_source_url     text        not null default '',
    photo_checked_at     date,
    product_brand        text,
    product_name         text,
    product_code         text,
    product_confirmed_at date,
    look3d_kind          text check (look3d_kind in ('shirt', 'blazer', 'field', 'trucker')),
    look3d_fabric        text,
    brand                text        not null default '',
    model                text        not null default '',
    size                 text        not null default '',
    bought_year          smallint check (bought_year between 1950 and 2100),
    review               text        not null default '',
    rebuy                text        not null default 'unknown' check (rebuy in ('unknown', 'yes', 'no')),
    fabric               text        not null default '' check (fabric in ('', 'thin', 'mid', 'thick')),
    neck                 text        not null default '' check (neck in ('', 'low', 'mid', 'high')),
    measures             jsonb       not null default '{}'::jsonb,
    link                 text        not null default '',
    price                bigint check (price >= 0),
    checked_at           date,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now(),
    unique (owner_id, client_id),
    -- 사진 상태 규칙: 확인된 동일 제품이면 확인 기록(날짜 + 브랜드나 상품명)이 반드시 있고, 그 밖의 상태에는 product 가 없다
    constraint item_product_only_when_confirmed check (
        (photo_kind = 'confirmed' and product_confirmed_at is not null and (coalesce(product_brand, '') <> '' or coalesce(product_name, '') <> ''))
            or (photo_kind <> 'confirmed' and product_brand is null and product_name is null and product_code is null and product_confirmed_at is null)
        ),
    -- 상품 사진 상태가 아니면 사진 출처가 없다
    constraint item_source_only_with_product_photo check (
        photo_kind in ('confirmed', 'candidate', 'substitute') or (photo_source_name = '' and photo_source_url = '' and photo_checked_at is null)
        ),
    constraint item_look3d_pair check ((look3d_kind is null) = (look3d_fabric is null))
);
comment on column item.client_id is '앱(옷장 파일)의 id. 가져오기를 여러 번 해도 같은 옷은 한 번만 들어가게 하는 기준';
comment on column item.photo_img_ref is '화면에 거는 사진의 저장소 키(PhotoStore). 빈 문자열이면 사진 없음. 바이트는 DB 밖';
comment on column item.attr_source is '속성 출처: photo-draft(사진에서 뽑은 초안) / owner / owner-confirmed. 초안은 사용자 확인으로만 바뀐다';
create index item_owner_status_idx on item (owner_id, status);

create table item_match_candidate (
    id       bigserial primary key,
    item_id  bigint   not null references item (id) on delete cascade,
    position smallint not null check (position between 0 and 4),
    brand    text     not null default '',
    name     text     not null default '',
    evidence text     not null check (evidence in ('logo', 'text', 'owner')),
    note     text     not null default '',
    url      text     not null default '',
    check (brand <> '' or name <> '')
);
-- (item_id, position) 유일 제약은 두지 않는다: JPA 가 후보 목록을 통째로 바꿀 때 새 행 insert 가 옛 행 delete 보다 먼저 나가므로(Hibernate 플러시 순서) 유일 제약이 걸린다. 순서는 position 으로만 쓴다
create index item_match_candidate_item_idx on item_match_candidate (item_id, position);
comment on table item_match_candidate is '미확인 브랜드·상품 후보. 내 옷 정보가 아니다. 사용자가 확인하면 item.product_* 로 올라가고 여기서 빠진다';

create table decision (
    id               bigserial primary key,
    owner_id         bigint      not null references owner (id) on delete cascade,
    client_id        text        not null,
    item_client_id   text        not null default '',
    item_name        text        not null default '',
    before_lean      text        not null check (before_lean in ('buy', 'skip', 'unsure')),
    before_reason    text        not null default '',
    before_at        date,
    summary_overlaps smallint    not null default 0,
    summary_added    smallint    not null default 0,
    summary_blockers smallint    not null default 0,
    after_decision   text check (after_decision in ('buy', 'skip', 'hold')),
    after_helpful    text check (after_helpful in ('yes', 'some', 'no')),
    after_note       text        not null default '',
    after_at         date,
    after_shift      text check (after_shift in ('same', 'changed', 'settled', 'held')),
    created_at       timestamptz not null default now(),
    unique (owner_id, client_id),
    constraint decision_after_all_or_none check ((after_decision is null) = (after_helpful is null) and (after_decision is null) = (after_shift is null))
);
comment on table decision is '살까 말까 판정 기록. before 는 보기 전 마음, after 는 결정. 규칙 결과 요약(겹침·새 조합·걸림 수)만 남기고 확률은 없다';

create table catalog_product (
    id         bigserial primary key,
    owner_id   bigint      not null references owner (id) on delete cascade,
    client_id  text        not null,
    brand      text        not null default '',
    name       text        not null,
    code       text        not null default '',
    cat        text        not null check (cat in ('outer', 'top', 'bottom', 'shoes')),
    kind       text        not null,
    family     text        not null,
    light      smallint    not null check (light between 0 and 100),
    formality  smallint    not null check (formality between 1 and 3),
    pattern    text        not null check (pattern in ('solid', 'stripe', 'check', 'graphic')),
    seasons    text[]      not null default '{}',
    link       text        not null default '',
    price      bigint check (price >= 0),
    checked_at date,
    img_ref    text        not null default '',
    note       text        not null default '',
    added_at   date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (owner_id, client_id),
    check (name <> '')
);
comment on table catalog_product is '사람이 직접 넣은 상품. 가격·확인일은 사람이 확인한 시점의 값. 서버는 가격·재고·링크를 찾아오거나 갱신하지 않는다';

create table import_receipt (
    id              bigserial primary key,
    owner_id        bigint      not null references owner (id) on delete cascade,
    idempotency_key text        not null,
    request_hash    text        not null,
    response        jsonb       not null,
    created_at      timestamptz not null default now(),
    unique (owner_id, idempotency_key)
);
comment on table import_receipt is '옷장·상품 목록 가져오기의 멱등 영수증. 같은 키로 다시 오면 저장된 응답을 돌려주고 다시 쓰지 않는다. 같은 키에 다른 내용이면 409';
