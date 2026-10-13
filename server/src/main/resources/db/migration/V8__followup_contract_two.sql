-- Expand followup storage without changing dates or rewriting previously recorded outcomes.
alter table decision drop constraint decision_followup_outcome_check;
alter table decision add constraint decision_followup_outcome_check
    check (followup_outcome in ('purchased','not-purchased','pending','returned'));
alter table decision add column followup_size_result text
    check (followup_size_result in ('right','small','large','unknown'));
alter table decision add column followup_return_reason text
    check (followup_return_reason in ('size','fit','color','material','quality','changed','price','other','unknown'));
update decision set followup_size_result='unknown', followup_return_reason='unknown' where followup_outcome is not null;
alter table decision add constraint followup_contract_two_all_or_none check (
    (followup_outcome is null) = (followup_size_result is null)
    and (followup_outcome is null) = (followup_return_reason is null)
);
alter table decision add constraint followup_conditional_values check (
    (followup_outcome in ('purchased','returned') or followup_size_result='unknown')
    and (followup_outcome='returned' or followup_return_reason='unknown')
);
