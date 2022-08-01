The logic behind this report is strongly tied to sprints. This means that if an issue is not tied to a sprint (and a relevant one), it will never show up on the report.

This is by design, to make sure our processes are in line with our reporting.

The report generation can happen on any day of the week. Depending on where we are wrt to the sprint, the report is expected to pick the correct sprint. But it's only been tested for Fridays-Mondays mid-sprint, so please fix bugs. :P

#### How are issues picked up?
Let's talk about both sections separately.

##### Closed issues
For closed issues, we always want to look back at the previous week. So,

1. On Mondays of a new sprint: We look at issues closed in the `previous` sprint between Monday to Sunday of the previous week.
2. For every other day in the sprint: We look at issues closed in the `current` sprint between Monday to Sunday of that week.

##### Planned issues
For planned issues, we want to look forward. So,

1. On Friday-Sunday at the end of a sprint: We look at issues planned and still open for the `next` sprint.
2. For every other day in the sprint: We look at issues planned and still open for the `current` sprint.


#### How to create a clean report

To make sure that your work is accurately represented, you need to make sure that:
- Issue is associated to the correct sprint
- Issue has correct priority (critical, high, medium, low)
- Issue has correct type (bug, feature, task, chore)
- Issue is in the correct epic, if applicable
- Issue is in the correct Zenhub column
- Issue is assigned to the correct person

This is not applicable to design tasks yet, we'll come up with a good way to work with those this week.
