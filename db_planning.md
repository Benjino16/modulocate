# DB Schema




---
# Account / Admin

### users
- id:               uuid   PK
- username:         text   UNIQUE
- email:            text   UNIQUE
- password_hash     text

### audit_logs
- id:               uuid      PK
- datetime:         datetime
- log:              text
- user_id:          uuid?     FK→users

---

# Module-System

### projects
- id:    uuid  PK
- name:  text

### settings
- id:           uuid  PK
- project_id:   uuid  FK→projects
- key:          text
- value:        jsonb

### date_sort_tags
-- Reine UI-Sortier-/Gruppierungs-Buckets ("Q1", "Q2", ...), bewusst getrennt von `dates`/
-- `module_in_date`: diese Tags fließen nie in Rules/Blocking/Allocation ein, sondern dienen
-- nur der Darstellung ("alle Module des 1. Quartals"). Eine geteilte Zeile statt eines freien
-- Strings auf `modules`, damit "Q1" -> "Quartal 1" umbenennen eine Zeile ändert, nicht jedes Modul.
- id:          uuid  PK
- project_id:  uuid  FK→projects
- label:       text
- sort_order:  int   (explizite Reihenfolge, damit z.B. "Q10" nicht alphabetisch vor "Q2" sortiert)

### category_sort_tags
-- analog zu date_sort_tags, nur für Categories ("Musik", "Sport", ...) statt Dates.
- id:          uuid  PK
- project_id:  uuid  FK→projects
- label:       text
- sort_order:  int

### modules
- id:              uuid   PK
- project_id:      uuid   FK→projects
- permanent_name:  text   (das System kann damit gleiche Module über Projekte hinweg nachvollziehen)
- name:            text
- description:     text?
- teacher:         text?
- picture_url:     text?
- min:             int
- max:             int
- schedule_label:  text?  (kurze Freitext-Anzeige wie "Jeden Montag", "Q2 - Mi" oder "Block" fürs
                           Modul-Tile — bewusst freier Text pro Modul, da hier auch Abweichungen
                           vom Standardfall reinpassen)
- date_sort_id:      uuid?  FK→date_sort_tags      (UI-Sortier-Bucket, z.B. "Q1" ohne Wochentag)
- category_sort_id:  uuid?  FK→category_sort_tags  (UI-Sortier-Bucket, z.B. "Musik")

### module_categories
- id:          uuid  PK
- project_id:  uuid  FK→projects
- name:        text

### module_in_category
- module_id:    uuid  PK  FK→modules
- category_id:  uuid  PK  FK→module_categories
- project_id:   uuid  FK→projects

### category_includes_category
-- eine Category kann andere Categories einschließen (Komposition)
-- "Kunst+MINT" referenziert Kunst + MINT als sub_category_id
-- beim Auflösen: Module aus child gelten automatisch als Teil von parent
- parent_category_id:  uuid  PK  FK→module_categories
- sub_category_id:     uuid  PK  FK→module_categories
- project_id:          uuid  FK→projects

### student_groups
- id:          uuid  PK
- project_id:  uuid  FK→projects
- name:        text
- rule_id:     uuid? FK→rules  -- jede Gruppe hat max. eine Rule

### students
- id:           uuid  PK
- project_id:   uuid  FK→projects
- name:         text
- email:        text  UNIQUE
- email_2:      text? UNIQUE
- sign_in_code  text? UNIQUE
- vote_status   text 
- rule_id:      uuid? FK→rules  -- überschreibt Gruppen-Rule wenn gesetzt

### student_in_group
- student_id:  uuid  PK  FK→students
- group_id:    uuid  PK  FK→student_groups
- project_id:  uuid  FK→projects

### dates
- id:          uuid  PK
- project_id:  uuid  FK→projects
- name:        text

### module_in_date
-- ein Modul kann an mehreren Dates stattfinden (und ein Date von mehreren Modulen belegt sein) —
-- diese Relation fehlte bisher komplett; module_in_category dient als Vorbild für den Aufbau.
-- Damit lässt sich später prüfen, ob sich zwei Module über die belegten Dates hinweg überschneiden.
- module_id:   uuid  PK  FK→modules
- date_id:     uuid  PK  FK→dates
- project_id:  uuid  FK→projects

### rules
- id:          uuid  PK
- project_id:  uuid  FK→projects
- name:        text

### sub_rules
-- eine Rule besteht aus beliebig vielen sub_rules
-- jedes einem Studenten zugeteilte Modul darf höchstens eine sub_rule (rule-weit) abdecken
-- -> dadurch sind sub_rules untereinander immer distinct, ohne extra Flag/Gruppen-Konzept
--    und ohne die Transitivitäts-Ambiguität, die so ein Gruppen-Konzept erzeugen würde
- id:          uuid  PK
- rule_id:     uuid  FK→rules
- project_id:  uuid  FK→projects

### category_in_sub_rule
-- Categories innerhalb derselben sub_rule sind NICHT distinct: ein einzelnes Modul, das
-- Mitglied aller hier gelisteten Categories ist, deckt die sub_rule allein ab.
-- Gibt es kein solches Modul unter den zugeteilten, werden mehrere Module gebraucht, deren
-- Category-Vereinigung die sub_rule abdeckt (Set-Cover) — die zählen dann aber weiterhin
-- exklusiv nur für DIESE sub_rule, nicht für andere.
-- "2x Sport" wird nicht über ein count-Feld abgebildet, sondern über zwei separate
-- sub_rules mit je {Sport} — die Exklusivitätsregel erzwingt dann zwei unterschiedliche Module.
- sub_rule_id:  uuid  PK  FK→sub_rules
- category_id:  uuid  PK  FK→module_categories
- project_id:   uuid  FK→projects

---

## Blocking

### group_blocked_category
- group_id:     uuid  PK  FK→student_groups
- category_id:  uuid  PK  FK→module_categories
- project_id:   uuid  FK→projects
- is_blocked:   bool  -- true=blocked, false=explicit allow (whitelist)

### group_blocked_module
- group_id:    uuid  PK  FK→student_groups
- module_id:   uuid  PK  FK→modules
- project_id:  uuid  FK→projects
- is_blocked:  bool  -- true=blocked, false=explicit allow (whitelist)

### student_blocked_category
- student_id:   uuid  PK  FK→students
- category_id:  uuid  PK  FK→module_categories
- project_id:   uuid  FK→projects
- is_blocked:   bool  -- overrides group-level block when false

### student_blocked_module
- student_id:  uuid  PK  FK→students
- module_id:   uuid  PK  FK→modules
- project_id:  uuid  FK→projects
- is_blocked:  bool  -- overrides group-level block when false

### group_blocked_date
- group_id:    uuid  PK  FK→student_groups
- date_id:     uuid  PK  FK→dates
- project_id:  uuid  FK→projects
- is_blocked:  bool

### student_blocked_date
- student_id:  uuid  PK  FK→students
- date_id:     uuid  PK  FK→dates
- project_id:  uuid  FK→projects
- is_blocked:  bool  -- overrides group-level block when false

---

## Voting & Allocation

### student_eligible_module
-- Snapshot der aufgelösten Blocking-Regeln (group_blocked_*, student_blocked_*,
-- category_includes_category, Gruppen-Mitgliedschaft, Student-Override), berechnet
-- beim Phasenübergang setup->open. Reine Read-Optimierung für die Vote-App ("wer
-- darf was sehen"), damit nicht bei jedem Seitenaufruf die volle Blocking-Kette
-- aufgelöst werden muss — KEIN Korrektheits-Gate für die Allocation: der Worker
-- löst Eligibility beim Bau des AllocationInput immer live aus den aktuellen
-- Blocking-Tabellen auf und verlässt sich nie auf diesen Snapshot (siehe
-- "Live Resolution Instead of Frozen State" in planning.md). Deshalb muss dieser
-- Snapshot bei nachträglichen Änderungen (Notfall-Modul-Add/Remove, Gruppen-Rule/
-- Blocking-Edit, Gruppenwechsel) nur best-effort für noch nicht final abgestimmte
-- Studenten aktualisiert werden, nicht zwingend/synchron.
-- Liegt bewusst in Postgres statt Redis (dauerhafter Fakt der Wahl über den ganzen
-- Lifecycle, relational gejoint), nicht als ephemeres/vergleichbares Simulations-
-- ergebnis wie die Allocation-Runs.
-- Vote-App joint dies mit modules (für weiterhin live editierbare Metadaten:
-- Bild/Beschreibung/min/max). Module/Studenten werden hart gelöscht (siehe
-- planning.md "Hard Delete, No Soft-Delete Fields") — wie mit dadurch
-- dangelnden Snapshot-Zeilen nach einem Notfall-Remove umgegangen wird, ist
-- noch offen (siehe Section 6 in planning.md).
- student_id:  uuid  PK  FK→students
- module_id:   uuid  PK  FK→modules
- project_id:  uuid  FK→projects

### student_preferences
- student_id:  uuid  PK  FK→students
- module_id:   uuid  PK  FK→modules
- project_id:  uuid  FK→projects
- preference:  int

### student_in_module
- student_id:  uuid  PK  FK→students
- module_id:   uuid  PK  FK→modules
- project_id:  uuid  FK→projects
