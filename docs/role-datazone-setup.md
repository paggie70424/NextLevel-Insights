# c3l-NLI DataZone and Role Control Setup

## Concept Overview
Implementing 3 isolated DataZone projects for clear role-based catalog separation, while sharing underlying S3 and Glue assets. LF-Tags and row filters enforce the boundaries.

### 1. DataZone Projects Created
- **c3l-nli-Students**: For student-owned data discovery.
- **c3l-nli-Staff**: For staff analytics (only sees consented metadata).
- **c3l-nli-Admin**: For governance and administrative overview (sees all).

### 2. IAM Roles & Cognito Integration
Users are routed to these projects automatically via Cognito Groups mapping to IAM Roles:
| Cognito Group | IAM Role | DataZone Project | LF Row Filter |
|---------------|----------|------------------|---------------|
| `students` | `NextLevelStudentRole` | `c3l-nli-Students` | `student_id = ${aws:userid}` |
| `staff` | `NextLevelStaffRole` | `c3l-nli-Staff` | `student_id IN (consented list)` |
| `admin` | `NextLevelAdminRole` | `c3l-nli-Admin` | *(No filter, full access)* |

### 3. Lake Formation Setup
- One unified S3/Glue data layer.
- `c3l-nli-UpdateLakeFormationFilter` Lambda enforces staff limits dynamically.
- `domain`, `sensitivity`, and `tier` LF tags structure permissions at the database and table levels.

## Implementation Actions Taken
1. Configured Cognito Groups (`students`, `staff`, `admin`) to map to respective IAM Roles.
2. Created the 3 `c3l-nli-*` DataZone projects.
3. Configured LakeFormation base row-filtering patterns per role.
