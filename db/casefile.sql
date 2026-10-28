-- ════════════════════════════════════════════════════════════════════════════
--  FDMS CASE FILE — ο φάκελος των μαθητών που παρουσιάζουν πρόβλημα
--  Project: fdms-casefile (ΞΕΧΩΡΙΣΤΟ από το wingsahead — βλ. §1)
--  Αποφάνσεις ιδιοκτήτη 17/10/2026. Schema v1.
-- ════════════════════════════════════════════════════════════════════════════
--
--  §1  ΓΙΑΤΙ ΞΕΧΩΡΙΣΤΟ PROJECT
--  Αν ζούσε μέσα στο wingsahead, κάθε αλλαγή σχήματος θα περνούσε από την πύλη
--  §4φ (τοπική απόδειξη ×2, έλεγχος συμπεριφοράς, md5, advisors) — γιατί από
--  κάτω κρέμονται τα ζωντανά μητρώα. Εδώ είναι παρθένο έδαφος: δεν μπορεί να
--  βλάψει τίποτα, και χτίζεται χωρίς τελετουργικό.
--
--  §2  ΤΙ ΕΙΝΑΙ ΚΑΙ ΤΙ ΔΕΝ ΕΙΝΑΙ
--  ΕΙΝΑΙ: ο φάκελος — το περιστατικό, η συνέπεια που εφαρμόστηκε, η κρίση του
--  ιδιοκτήτη, η κατάσταση. Πληροφορία που ΔΕΝ την κρατά ούτε το FDMS ούτε το
--  Wings Ahead.
--  ΔΕΝ ΕΙΝΑΙ: δεύτερο training log. Δεν ξαναγράφει βαθμούς, ώρες ή θέση στο
--  syllabus — αυτά ζουν στο FDMS και η απόκλιση δύο αρχείων είναι η αρρώστια
--  που ανιχνεύει η γέφυρα.
--
--  §3  ΤΑ ΟΝΟΜΑΤΑ — ΑΠΟΦΑΝΣΗ ΙΔΙΟΚΤΗΤΗ 17/10/2026
--  Τα ΠΡΑΓΜΑΤΙΚΑ ονόματα μπαίνουν, ρητά: «μην το κάνουμε με κωδικούς για τους
--  μαθητές … να λέμε "ο μαθητής <επώνυμο>" και να εμφανίζεται και να
--  ενημερώνεται σωστά η καρτέλα του». Η πρόταση ψευδωνυμοποίησης της κύριας
--  συνεδρίας ΑΠΟΣΥΡΕΤΑΙ — ο ιδιοκτήτης σταθμίζει την έκθεση και αποφασίζει.
--  ΑΜΕΤΑΒΛΗΤΟ, ΚΑΙ ΑΛΛΟ ΠΡΑΓΜΑ: στο ΔΗΜΟΣΙΟ repo (GitHub) κανένα πραγματικό
--  όνομα, ποτέ — ούτε εδώ ως seed, ούτε σε fixture, ούτε σε κείμενο
--  παρατήρησης. Αυτό το αρχείο ορίζει ΣΤΗΛΕΣ· δεδομένα δεν μπαίνουν ποτέ μέσα
--  του. Ο δρόμος είναι η εφαρμογή, όχι το git.
--
--  §4  ΔΕΝ ΥΠΑΡΧΕΙ ΣΚΛΗΡΟ DELETE
--  Σε φάκελο που τεκμηριώνει γιατί ένας μαθητής οδηγήθηκε σε Συμβούλιο, μια
--  χαμένη γραμμή είναι χαμένη απόδειξη. Η διαγραφή είναι σήμανση. Το log κρατά
--  πριν→μετά για ΚΑΘΕ εγγραφή, ώστε κάθε λάθος — ανθρώπου ή agent — να
--  βρίσκεται και να αναιρείται.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── ΤΑ ΚΛΕΙΣΤΑ ΛΕΞΙΛΟΓΙΑ ────────────────────────────────────────────────────
-- Κλειστά, γιατί ένα ελεύθερο πεδίο «είδος» γίνεται σε έναν χρόνο πέντε
-- ορθογραφίες του ίδιου πράγματος και κανένα ερώτημα δεν τις μαζεύει.

create type case_kind as enum (
  'fail',            -- ΑΠΟΤΥΧΙΑ (0-49%)
  'lag',             -- ΥΣΤΕΡΗΣΗ (50-59%) — «almost good», κατά τον ιδιοκτήτη
  -- ΤΑ ΔΥΟ ΖΕΥΓΗ IN/OUT (απόφανση 17/10/2026). Το Φύλλο μη Πτήσης και το ΚΕΠΕ
  -- είναι ΚΑΤΑΣΤΑΣΕΙΣ, όχι στιγμές: ο μαθητής μπαίνει, μεσολαβεί εξέταση ή
  -- επανεξέταση, και βγαίνει. Μία γραμμή ανά κατάσταση θα έκρυβε το ΠΟΣΟ
  -- ΕΜΕΙΝΕ — που είναι ακριβώς αυτό που θέλει να βλέπει ο φάκελος.
  'nfs_in',          -- Φύλλο μη Πτήσης — είσοδος
  'nfs_out',         -- Φύλλο μη Πτήσης — άρση (μετά την εξέταση / επανεξέταση)
  'sms_in',          -- ΚΕΠΕ — είσοδος (SMS στη γλώσσα της εφαρμογής)
  'sms_out',         -- ΚΕΠΕ — έξοδος
  'progress_check',  -- Δοκιμή Προόδου
  'airsickness',     -- ΑΕΡΟΝΑΥΤΙΑ / περιστατικό Φυσιολογίας Πτήσεων
  'ground_exam',     -- γραπτή εξέταση / αξιολόγηση εδάφους
  'oral_exam',       -- προφορική προ πτήσεως ενημέρωση
  'referral',        -- κρίση Πτητικής Καταλληλότητας
  'board',           -- Συμβούλιο Πτητικής Ικανότητας
  'note'             -- ελεύθερη σημείωση του ιδιοκτήτη
);

create type case_status as enum ('open', 'closed', 'withdrawn');

-- ── ΟΙ ΜΑΘΗΤΕΣ ──────────────────────────────────────────────────────────────
-- Δικός τους πίνακας, ώστε το όνομα να ζει ΜΙΑ φορά: μια διόρθωση επωνύμου
-- είναι μία γραμμή, όχι σαράντα. Το `oid` είναι το immutable id του FDMS και
-- είναι ο ΜΟΝΟΣ ασφαλής σύνδεσμος προς το training log και το Wings Ahead —
-- η αντιστοίχιση με επώνυμο έχει ήδη κοστίσει μια φορά (bridge-spec § F7).

create table public.students (
  id          uuid primary key default gen_random_uuid(),
  oid         text unique,            -- FDMS object id· null όσο δεν έχει αντιστοιχιστεί
  rank        text,
  last_name   text not null,
  first_name  text,
  mn          text,                   -- ΑΜ
  course      text,                   -- π.χ. «99Α», «ITAF»
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table  public.students is 'Οι μαθητές του φακέλου. ΠΡΑΓΜΑΤΙΚΑ ονόματα, κατά την απόφανση 17/10/2026 — αλλά ΠΟΤΕ ως seed σε tracked αρχείο.';
comment on column public.students.oid is 'Το immutable id του FDMS. Η αντιστοίχιση γίνεται ΜΕ ΑΥΤΟ, ποτέ με επώνυμο.';

create index students_active_idx on public.students (active, last_name);
create index students_course_idx on public.students (course) where active;

-- ── Ο ΦΑΚΕΛΟΣ ───────────────────────────────────────────────────────────────

create table public.cases (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid        not null references public.students(id) on delete restrict,
  occurred_on   date        not null,
  kind          case_kind   not null,
  stage         text,                   -- Στάδιο / κατηγορία (contact, instrument…)
  sortie        text,                   -- ο κωδικός της εξόδου, π.χ. C4790
  score_pct     smallint,               -- όπου υπάρχει· null όπου δεν βαθμολογείται
  consequence   text,                   -- τι εφαρμόστηκε στην πράξη
  cites         jsonb       not null default '[]'::jsonb,  -- [{src:'ΠΔ 29/2020', ref:'άρθρο 3 παρ.1γ'}]
  note          text,                   -- η κρίση του ιδιοκτήτη — ο λόγος που υπάρχει η βάση
  status        case_status not null default 'open',
  deleted_at    timestamptz,            -- §4 — σήμανση, όχι εξαφάνιση
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint cases_score_range check (score_pct is null or score_pct between 0 and 100)
);

comment on table public.cases is 'Το περιστατικό, η συνέπεια, η κρίση του ιδιοκτήτη. ΟΧΙ δεύτερο training log.';
comment on column public.cases.deleted_at is 'Σήμανση διαγραφής. Σκληρό DELETE δεν επιτρέπεται — βλ. §4 και τις πολιτικές RLS.';

create index cases_student_idx on public.cases (student_id, occurred_on desc);
create index cases_open_idx    on public.cases (status) where deleted_at is null;
create index cases_kind_idx    on public.cases (kind, occurred_on desc);

-- ── ΤΟ LOG ──────────────────────────────────────────────────────────────────
-- Γράφεται από trigger, όχι από τον καλούντα: ένας agent που ξεχνά να γράψει
-- log δεν είναι λιγότερο επικίνδυνος επειδή του το ζητήσαμε ευγενικά.

create table public.case_log (
  id          bigserial   primary key,
  entity      text        not null check (entity in ('case','student')),
  entity_id   uuid        not null,
  action      text        not null check (action in ('insert','update','delete')),
  actor       text        not null,     -- 'admin' | 'agent:board-director' | 'agent:syllabus' …
  before      jsonb,
  after       jsonb,
  at          timestamptz not null default now()
);

comment on table public.case_log is 'Κάθε εγγραφή, πριν→μετά. Ο μόνος τρόπος να βρεθεί τι έκανε λάθος ένας agent.';

create index case_log_entity_idx on public.case_log (entity, entity_id, at desc);
create index case_log_actor_idx  on public.case_log (actor, at desc);

-- Ο δράστης έρχεται από το JWT όταν υπάρχει, αλλιώς από ρητή ρύθμιση συνεδρίας
-- (ο proxy βάζει `set local fdms.actor = 'agent:board-director'`), αλλιώς 'admin'.
create or replace function public.fdms_actor() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'actor', ''),
    nullif(current_setting('fdms.actor', true), ''),
    'admin'
  );
$$;

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare ent text := tg_argv[0];
begin
  if tg_op = 'INSERT' then
    insert into public.case_log(entity, entity_id, action, actor, before, after)
    values (ent, new.id, 'insert', public.fdms_actor(), null, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    new.updated_at := now();
    insert into public.case_log(entity, entity_id, action, actor, before, after)
    values (ent, new.id,
            -- 28/10/2026 — ΔΙΟΡΘΩΘΗΚΕ ΣΤΟ CLOUD ΚΑΙ ΟΧΙ ΕΔΩ· η εξαγωγή το
            -- αποκάλυψε. Έγραφε `old.deleted_at is null`, που δουλεύει για το
            -- `cases` αλλά ΟΧΙ για το `students`: ο ΙΔΙΟΣ trigger τρέχει και
            -- στους δύο πίνακες, και το `students` ΔΕΝ ΕΧΕΙ στήλη deleted_at.
            -- Η αναφορά σε ανύπαρκτο πεδίο εγγραφής σκάει στην εκτέλεση — το
            -- `and` της SQL δεν εγγυάται βραχυκύκλωμα. Το `to_jsonb(old) ->>`
            -- επιστρέφει απλώς NULL όταν το πεδίο λείπει.
            case when ent = 'case'
                   and (to_jsonb(old) ->> 'deleted_at') is null
                   and (to_jsonb(new) ->> 'deleted_at') is not null
                 then 'delete' else 'update' end,
            public.fdms_actor(), to_jsonb(old), to_jsonb(new));
    return new;
  end if;
  return null;
end;
$$;

create trigger cases_audit_trg
  before insert or update on public.cases
  for each row execute function public.audit_row('case');

create trigger students_audit_trg
  before insert or update on public.students
  for each row execute function public.audit_row('student');

-- ── RLS — ΕΝΑΣ ΧΡΗΣΤΗΣ, Ο ADMIN ─────────────────────────────────────────────
-- Απόφανση 17/10/2026: «ως administrator εγώ να τα βλέπω όλα και δεν χρειάζεται
-- να βλέπει κάποιος άλλος». Καμία ανώνυμη πρόσβαση, καθόλου.

alter table public.students enable row level security;
alter table public.cases    enable row level security;
alter table public.case_log enable row level security;

create policy students_read   on public.students for select to authenticated using (true);
create policy students_write  on public.students for insert to authenticated with check (true);
create policy students_update on public.students for update to authenticated using (true) with check (true);

create policy cases_read      on public.cases    for select to authenticated using (true);
create policy cases_write     on public.cases    for insert to authenticated with check (true);
create policy cases_update    on public.cases    for update to authenticated using (true) with check (true);

create policy log_read        on public.case_log for select to authenticated using (true);

-- ΚΑΜΙΑ πολιτική DELETE πουθενά: το σκληρό delete είναι αδύνατο ακόμη και για
-- τον admin. ΚΑΜΙΑ πολιτική εγγραφής στο log: γράφει μόνο ο trigger.
revoke all on public.case_log from anon, authenticated;
grant select on public.case_log to authenticated;

-- ── Η ΟΨΗ ΠΟΥ ΔΙΑΒΑΖΟΥΝ Ο AGENT ΚΑΙ Η ΚΑΡΤΕΛΑ ───────────────────────────────
-- Χωρίς διαγραμμένα, με το όνομα ενωμένο, ώστε ο agent να μη χρειάζεται να
-- ξέρει τη σύμβαση του soft delete για να μη δει φαντάσματα.

create view public.cases_live as
  select c.id, c.student_id,
         s.oid, s.rank, s.last_name, s.first_name, s.course,
         c.occurred_on, c.kind, c.stage, c.sortie, c.score_pct,
         c.consequence, c.cites, c.note, c.status, c.created_at, c.updated_at
  from public.cases c
  join public.students s on s.id = c.student_id
  where c.deleted_at is null;

-- ── ΔΙΟΡΘΩΣΕΙΣ ΤΩΝ ADVISORS (εφαρμόστηκαν 17/10/2026, migration casefile_v1_advisor_fixes)
--    Ο έλεγχος ασφαλείας του Supabase βρήκε τέσσερα· όλα πραγματικά.

-- Η όψη έτρεχε με τα δικαιώματα του ΔΗΜΙΟΥΡΓΟΥ, άρα παρέκαμπτε το RLS των
-- πινάκων από κάτω — ένα ERROR, και το σοβαρότερο των τεσσάρων.
alter view public.cases_live set (security_invoker = on);

-- Χωρίς σταθερό search_path, ένας ρόλος μπορεί να στρέψει τη συνάρτηση σε δικό
-- του schema και να της αλλάξει το νόημα.
alter function public.fdms_actor() set search_path = public, pg_temp;

-- Η audit_row είναι συνάρτηση TRIGGER — κανείς δεν την καλεί απευθείας. Όσο
-- ήταν εκτελέσιμη μέσω /rest/v1/rpc ήταν SECURITY DEFINER στα χέρια
-- οποιουδήποτε. Ο trigger δεν περνά από GRANT, άρα εξακολουθεί να τρέχει.
revoke execute on function public.audit_row() from public, anon, authenticated;
revoke execute on function public.fdms_actor() from anon;

-- Μετά από αυτά: get_advisors(security) → ΜΗΔΕΝ ευρήματα.
--
-- ΑΠΟΔΕΙΞΗ ΛΕΙΤΟΥΡΓΙΑΣ (δοκιμή 17/10/2026, καθαρίστηκε αμέσως μετά):
--   insert μαθητή   → log: student · insert · agent:board-director
--   insert φακέλου  → log: case    · insert · agent:board-director
--   soft delete     → log: case    · DELETE · admin
--   cases_live      → 0 ορατές γραμμές (η σημασμένη κρύβεται σωστά)
-- Η βάση παραδόθηκε ΑΔΕΙΑ: students 0 · cases 0 · case_log 0.

-- ════════════════════════════════════════════════════════════════════════════
-- ΡΗΤΑ ΔΙΚΑΙΩΜΑΤΑ ΓΙΑ ΤΟ DATA API (προσθήκη 28/10/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- ΤΙ ΑΛΛΑΞΕ: από 30/10/2026 το Supabase ΣΤΑΜΑΤΑ να δίνει αυτόματα πρόσβαση
-- Data API σε ΝΕΟΥΣ πίνακες του schema «public». Οι ΥΠΑΡΧΟΝΤΕΣ πίνακες του
-- ζωντανού project ΔΕΝ επηρεάζονται — κρατούν ό,τι έχουν.
--
-- ΓΙΑΤΙ ΜΑΣ ΑΦΟΡΑ ΠΑΡΟΛΑ ΑΥΤΑ: αυτό το αρχείο είναι το ΜΟΝΟ σχέδιο για να
-- ξαναστηθεί ο φάκελος — σε νέο project, σε preview branch, ή μετά από ένα
-- τοπικό «supabase db reset». Χωρίς τις παρακάτω γραμμές, μια τέτοια
-- ανασύσταση θα έφτιαχνε πίνακες που ΥΠΑΡΧΟΥΝ αλλά απαντούν «permission
-- denied» σε κάθε κλήση του proxy — και θα το ανακαλύπταμε τη χειρότερη
-- στιγμή: όταν ξαναστήνουμε επειδή κάτι χάθηκε.
--
-- ΤΙ ΔΕΝ ΔΙΝΕΤΑΙ, ΕΠΙΤΗΔΕΣ:
--   · anon  — ΤΙΠΟΤΑ. «Καμία ανώνυμη πρόσβαση, καθόλου» (απόφανση 17/10).
--   · delete — πουθενά σε authenticated: δεν υπάρχει πολιτική DELETE, και τα
--     δικαιώματα δεν πρέπει να υπόσχονται ό,τι το RLS αρνείται.
--   · case_log — το χειρίζεται το μπλοκ παραπάνω (revoke all, grant select).
--     Γράφει ΜΟΝΟ ο trigger· καμία σειρά (sequence) δεν ανοίγει σε ρόλο API.
-- Τα παρακάτω ΚΑΘΡΕΦΤΙΖΟΥΝ ακριβώς τις πολιτικές RLS, ούτε ένα δικαίωμα πάνω.

grant select, insert, update on public.students   to authenticated;
grant select, insert, update on public.cases      to authenticated;
grant select                 on public.cases_live to authenticated;

-- Ο proxy μιλά με service-role κλειδί. Ο ρόλος παρακάμπτει το RLS, αλλά ΟΧΙ τα
-- δικαιώματα πίνακα: χωρίς αυτά, μετά τις 30/10 ένας ανασυσταμένος φάκελος θα
-- αρνιόταν και στον ίδιο τον proxy.
grant select, insert, update, delete on public.students   to service_role;
grant select, insert, update, delete on public.cases      to service_role;
grant select                         on public.cases_live to service_role;
grant select, insert                 on public.case_log   to service_role;


-- ════════════════════════════════════════════════════════════════════════════
-- ΟΙ RPC ΤΟΥ AGENT (migration `casefile_agent_rpc`)
-- ════════════════════════════════════════════════════════════════════════════
-- ΓΡΑΦΤΗΚΑΝ ΕΔΩ ΣΤΙΣ 28/10/2026, ΕΞΑΓΟΜΕΝΕΣ ΑΥΤΟΛΕΞΕΙ από το ζωντανό project
-- με `pg_get_functiondef`. Μέχρι τότε ΥΠΗΡΧΑΝ ΜΟΝΟ ΣΤΟ CLOUD: ο proxy τις
-- καλούσε (`rpc/fn_add_case`, `rpc/fn_update_case`, `rpc/fn_upsert_student`)
-- και το repo δεν τις είχε. Αν το project χανόταν, ο φάκελος ΔΕΝ ξαναστηνόταν
-- — και το μήνυμα παύσης του Supabase υπόσχεται ότι «τα ΔΕΔΟΜΕΝΑ παραμένουν
-- διαθέσιμα για λήψη»· οι συναρτήσεις δεν είναι δεδομένα.
--
-- ΓΙΑΤΙ ΕΙΝΑΙ SECURITY DEFINER: τρέχουν με τα δικαιώματα του ιδιοκτήτη τους,
-- ώστε να γράφουν στους πίνακες ΚΑΙ να περνούν τον δράστη στο log μέσω
-- `set_config('fdms.actor', …, true)` — η ρύθμιση είναι ΤΟΠΙΚΗ στη συναλλαγή
-- (το τρίτο όρισμα `true`), άρα δεν διαρρέει σε επόμενο αίτημα της ίδιας
-- σύνδεσης. Κάθε μία απαιτεί ΜΗ ΚΕΝΟ actor και σκάει αλλιώς: ο φάκελος δεν
-- δέχεται ανώνυμη εγγραφή ούτε κατά λάθος.

CREATE OR REPLACE FUNCTION public.fn_add_case(p_actor text, p_student_id uuid, p_occurred_on date, p_kind case_kind, p_stage text DEFAULT NULL::text, p_sortie text DEFAULT NULL::text, p_score_pct smallint DEFAULT NULL::smallint, p_consequence text DEFAULT NULL::text, p_cites jsonb DEFAULT '[]'::jsonb, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'actor required'; end if;
  perform set_config('fdms.actor', p_actor, true);
  insert into public.cases(student_id, occurred_on, kind, stage, sortie,
                           score_pct, consequence, cites, note)
  values (p_student_id, p_occurred_on, p_kind, p_stage, p_sortie,
          p_score_pct, p_consequence, coalesce(p_cites, '[]'::jsonb), p_note)
  returning id into v_id;
  return v_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.fn_update_case(p_actor text, p_case_id uuid, p_consequence text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_status case_status DEFAULT NULL::case_status, p_cites jsonb DEFAULT NULL::jsonb, p_withdraw boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'actor required'; end if;
  perform set_config('fdms.actor', p_actor, true);
  update public.cases set
    consequence = coalesce(p_consequence, consequence),
    note        = coalesce(p_note, note),
    status      = coalesce(p_status, status),
    cites       = coalesce(p_cites, cites),
    deleted_at  = case when p_withdraw then now() else deleted_at end
  where id = p_case_id;
  if not found then raise exception 'case % not found', p_case_id; end if;
end; $function$;

-- ΠΡΟΣΟΧΗ ΣΤΗ ΣΕΙΡΑ ΤΑΥΤΟΠΟΙΗΣΗΣ: πρώτα το `oid` (το σταθερό id του FDMS),
-- μετά επώνυμο+σειρά. Το δεύτερο σκέλος είναι ΕΥΡΕΤΙΚΟ και μπορεί να ενώσει
-- δύο συνώνυμους της ίδιας σειράς — γι' αυτό οι μαθητές γράφονται κανονικά
-- ΜΟΝΟ από τον ιδιοκτήτη, με το tools/casefile_import_students.py από το
-- ιδιωτικό roster, και όχι από τον agent.
CREATE OR REPLACE FUNCTION public.fn_upsert_student(p_actor text, p_last_name text, p_first_name text DEFAULT NULL::text, p_rank text DEFAULT NULL::text, p_mn text DEFAULT NULL::text, p_course text DEFAULT NULL::text, p_oid text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if coalesce(trim(p_actor), '') = '' then raise exception 'actor required'; end if;
  perform set_config('fdms.actor', p_actor, true);
  if p_oid is not null then
    select id into v_id from public.students where oid = p_oid;
  end if;
  if v_id is null then
    select id into v_id from public.students
     where lower(last_name) = lower(p_last_name)
       and (p_course is null or course = p_course) limit 1;
  end if;
  if v_id is null then
    insert into public.students(oid, rank, last_name, first_name, mn, course)
    values (p_oid, p_rank, p_last_name, p_first_name, p_mn, p_course)
    returning id into v_id;
  else
    update public.students set
      oid        = coalesce(p_oid, oid),
      rank       = coalesce(p_rank, rank),
      first_name = coalesce(p_first_name, first_name),
      mn         = coalesce(p_mn, mn),
      course     = coalesce(p_course, course)
    where id = v_id;
  end if;
  return v_id;
end; $function$;

-- ── ⚠ ΕΚΚΡΕΜΕΙ — ΔΕΝ ΕΧΕΙ ΕΦΑΡΜΟΣΤΕΙ ΣΤΟ CLOUD ────────────────────────────
-- Τον Οκτώβριο αφαιρέσαμε το δικαίωμα εκτέλεσης από τις `audit_row` και
-- `fdms_actor` (βλ. παραπάνω) γιατί ήταν SECURITY DEFINER στα χέρια
-- οποιουδήποτε. Οι τρεις `fn_*` είναι ΕΠΙΣΗΣ SECURITY DEFINER, γράφουν στον
-- φάκελο, και δημιουργήθηκαν ΑΡΓΟΤΕΡΑ — κανείς δεν τους αφαίρεσε τίποτα.
-- Η PostgreSQL δίνει EXECUTE στο PUBLIC από προεπιλογή, και το Supabase
-- προσθέτει anon/authenticated/service_role στα δικά του default privileges.
-- ΔΕΝ ΤΟ ΙΣΧΥΡΙΖΟΜΑΣΤΕ — ΜΕΤΡΙΕΤΑΙ ΠΡΩΤΑ (το ερώτημα είναι στο roadmap).
-- Αν η μέτρηση δείξει ότι ο `anon` μπορεί να τις καλέσει, τρέχουν αυτά:
--
--   revoke execute on function public.fn_add_case(text, uuid, date, case_kind,
--          text, text, smallint, text, jsonb, text) from public, anon, authenticated;
--   revoke execute on function public.fn_update_case(text, uuid, text, text,
--          case_status, jsonb, boolean) from public, anon, authenticated;
--   revoke execute on function public.fn_upsert_student(text, text, text, text,
--          text, text, text) from public, anon, authenticated;
--   grant execute on function public.fn_add_case(text, uuid, date, case_kind,
--          text, text, smallint, text, jsonb, text) to service_role;
--   grant execute on function public.fn_update_case(text, uuid, text, text,
--          case_status, jsonb, boolean) to service_role;
--   grant execute on function public.fn_upsert_student(text, text, text, text,
--          text, text, text) to service_role;
--
-- Ο proxy μιλά ΜΟΝΟ με service-role κλειδί, άρα δεν χάνει τίποτα. § 4φ: στο
-- cloud τρέχει μόνο ο ιδιοκτήτης, με ρητό λόγο του.
