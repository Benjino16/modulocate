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

### rules
- id:          uuid  PK
- project_id:  uuid  FK→projects
- name:        text

### rule_alternatives
-- eine Rule ist erfüllt wenn EINE Alternative erfüllt ist (OR-Logik)
-- einfache Rules haben genau eine Alternative
- id:       uuid  PK
- rule_id:  uuid  FK→rules
- project_id: uuid FK→projects

### category_in_rule_alternative
-- innerhalb einer Alternative müssen ALLE categories erfüllt sein (AND-Logik)
-- count: wie viele verschiedene Module aus dieser Category benötigt werden
- alternative_id:  uuid  PK  FK→rule_alternatives
- category_id:     uuid  PK  FK→module_categories
- count:           int        -- z.B. 2 = "2x Sport"
- project_id:      uuid  FK→projects

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

### student_preferences
- student_id:  uuid  PK  FK→students
- module_id:   uuid  PK  FK→modules
- project_id:  uuid  FK→projects
- preference:  int

### student_in_module
- student_id:  uuid  PK  FK→students
- module_id:   uuid  PK  FK→modules
- project_id:  uuid  FK→projects
