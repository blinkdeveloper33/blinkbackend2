This is the Database Schema for the Blink App.


##SQL Definition of admin_users table:

create table
  public.admin_users (
    id uuid not null default gen_random_uuid (),
    email text not null,
    password_hash text not null,
    first_name text not null,
    last_name text not null,
    created_at timestamp without time zone not null default now(),
    updated_at timestamp without time zone null default now(),
    constraint admin_users_pkey primary key (id),
    constraint admin_users_email_key unique (email)
  ) tablespace pg_default;

create trigger trigger_update_admin_users_updated_at before
update on admin_users for each row
execute function update_admin_users_updated_at ();

##SQL Definition bank_accounts table:

create table
  public.bank_accounts (
    id uuid not null default gen_random_uuid (),
    user_id uuid not null,
    plaid_access_token text not null,
    plaid_item_id text not null,
    account_id text not null,
    account_name text not null,
    account_type text not null,
    account_subtype text not null,
    account_mask text not null,
    created_at timestamp without time zone null default now(),
    cursor text null,
    available_balance numeric null,
    current_balance numeric null,
    currency character varying(3) null,
    constraint bank_accounts_pkey primary key (id),
    constraint unique_account_id unique (account_id),
    constraint bank_accounts_user_id_fkey foreign key (user_id) references users (id) on delete cascade
  ) tablespace pg_default;

  


##SQL Definition of blink_advance_approvals table:

create table
  public.blink_advance_approvals (
    id uuid not null default gen_random_uuid (),
    user_id uuid not null,
    is_approved boolean not null default false,
    approved_at timestamp without time zone null,
    created_at timestamp without time zone not null default now(),
    updated_at timestamp without time zone null,
    constraint blink_advance_approvals_pkey primary key (id),
    constraint blink_advance_approvals_user_id_unique unique (user_id),
    constraint blink_advance_approvals_user_id_fkey foreign key (user_id) references users (id) on delete cascade
  ) tablespace pg_default;


  ##SQL Definition of blink_advance_audit table:

create table
  public.blink_advance_audit (
    id uuid not null default gen_random_uuid (),
    blink_advance_id uuid not null,
    old_status public.blink_advance_status null,
    new_status public.blink_advance_status not null,
    changed_at timestamp without time zone not null default now(),
    changed_by uuid null,
    constraint blink_advance_audit_pkey primary key (id)
  ) tablespace pg_default;


##SQL Definition of blink_advances table:

  create table
  public.blink_advances (
    id uuid not null default gen_random_uuid (),
    user_id uuid not null,
    bank_account_id uuid not null,
    requested_amount numeric(10, 2) not null,
    transfer_speed public.transfer_speed_enum not null,
    fee numeric generated always as (
      case
        when (transfer_speed = 'Instant'::transfer_speed_enum) then 11.50
        when (transfer_speed = 'Standard'::transfer_speed_enum) then 5.50
        else null::numeric
      end
    ) stored (10, 2) null,
    repay_date date not null,
    created_at timestamp without time zone not null default now(),
    updated_at timestamp without time zone null,
    approval_id uuid null,
    approved_at timestamp without time zone null,
    disbursed_at timestamp without time zone null,
    repaid_at timestamp without time zone null,
    credit_authorization_id text null,
    credit_transfer_id text null,
    debit_authorization_id text null,
    debit_transfer_id text null,
    transfer_network text null,
    ach_class text null,
    metadata jsonb null,
    status text not null default 'pending'::text,
    constraint blink_advances_pkey primary key (id),
    constraint fk_blink_advances_approval_id foreign key (approval_id) references blink_advance_approvals (id) on delete set null,
    constraint fk_blink_advances_bank_account_id foreign key (bank_account_id) references bank_accounts (id) on delete cascade,
    constraint fk_blink_advances_user_id foreign key (user_id) references users (id) on delete cascade,
    constraint blink_advances_requested_amount_check check (
      (
        (requested_amount >= (150)::numeric)
        and (requested_amount <= (300)::numeric)
      )
    ),
    constraint chk_repay_date check (
      (
        repay_date <= ((created_at + '31 days'::interval))::date
      )
    )
  ) tablespace pg_default;

create index if not exists idx_blink_advances_user_id on public.blink_advances using btree (user_id) tablespace pg_default;

create index if not exists idx_blink_advances_repay_date on public.blink_advances using btree (repay_date) tablespace pg_default;

create trigger trg_blink_advances_check_approval before insert on blink_advances for each row
execute function check_user_approval ();

create trigger trg_update_updated_at before
update on blink_advances for each row
execute function update_updated_at_column ();

create trigger trg_blink_advances_status_updates before
update on blink_advances for each row
execute function set_blink_advance_timestamps ();

create trigger trg_blink_advances_audit
after
update on blink_advances for each row
execute function blink_advance_status_audit ();


##SQL Definition of registration_sessions table:

create table
  public.registration_sessions (
    id uuid not null default gen_random_uuid (),
    email text not null,
    otp_code character varying(6) not null,
    expires_at timestamp without time zone not null,
    is_verified boolean not null default false,
    first_name text null,
    last_name text null,
    state text null,
    zipcode text null,
    password text null,
    created_at timestamp without time zone null default now(),
    constraint registration_sessions_pkey primary key (id),
    constraint registration_sessions_email_key unique (email)
  ) tablespace pg_default;



  ##SQL Definition of transactions table:

  create table
  public.transactions (
    id uuid not null default gen_random_uuid (),
    bank_account_id uuid not null,
    transaction_id text not null,
    amount numeric(10, 2) not null,
    date date not null,
    description text not null,
    original_description text null,
    category text null default 'Uncategorized'::text,
    category_detailed text null,
    merchant_name text null,
    pending boolean null default false,
    created_at timestamp without time zone null default now(),
    account_id text not null,
    user_id uuid null,
    constraint transactions_pkey primary key (id),
    constraint transactions_transaction_id_key unique (transaction_id),
    constraint fk_transactions_account_id foreign key (account_id) references bank_accounts (account_id) on delete cascade,
    constraint fk_transactions_bank_account_id foreign key (bank_account_id) references bank_accounts (id) on delete cascade,
    constraint transactions_user_id_fkey foreign key (user_id) references users (id)
  ) tablespace pg_default;


  ##SQL Definition of user_otps table:

  create table
  public.user_otps (
    id uuid not null default extensions.uuid_generate_v4 (),
    user_id uuid null,
    otp_code character varying not null,
    expires_at timestamp without time zone not null,
    created_at timestamp without time zone null default now(),
    is_verified boolean null default false,
    constraint user_otps_pkey primary key (id)
  ) tablespace pg_default;

  ##SQL Definition of users table:

  create table
  public.users (
    id uuid not null default gen_random_uuid (),
    email text not null,
    password text null,
    first_name text null,
    last_name text null,
    state text null,
    zipcode text null,
    created_at timestamp without time zone null default now(),
    email_verified boolean not null default false,
    constraint users_pkey primary key (id),
    constraint users_email_key unique (email)
  ) tablespace pg_default;