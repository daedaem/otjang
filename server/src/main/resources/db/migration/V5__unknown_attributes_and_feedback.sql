-- Unknown inputs remain NULL; do not convert old recorded values or reclassify personal drafts.
alter table item alter column kind drop not null;
alter table item alter column family drop not null;
alter table item alter column light drop not null;
alter table item alter column formality drop not null;
alter table item alter column pattern drop not null;
alter table catalog_product alter column kind drop not null;
alter table catalog_product alter column family drop not null;
alter table catalog_product alter column light drop not null;
alter table catalog_product alter column formality drop not null;
alter table catalog_product alter column pattern drop not null;
alter table decision add column after_insight text not null default '';
alter table decision add column after_compared_with text not null default 'none' check(after_compared_with in ('none','chatbot','photos','other'));
alter table decision add column after_comparison_note text not null default '';
alter table decision add column followup_outcome text check(followup_outcome in ('purchased','not-purchased','pending'));
alter table decision add column followup_worn text check(followup_worn in ('yes','no','unknown'));
alter table decision add column followup_regret text check(followup_regret in ('yes','no','unknown'));
alter table decision add column followup_note text not null default '';
alter table decision add column followup_at date;
alter table decision add constraint followup_fields_all_or_none check ((followup_outcome is null) = (followup_worn is null) and (followup_outcome is null) = (followup_regret is null));

alter table decision alter column summary_overlaps drop not null;
alter table decision alter column summary_added drop not null;
alter table decision alter column summary_blockers drop not null;
