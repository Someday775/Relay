Feature: Task management

  Scenario: A member creates a task
    Given I am signed in with the "member" role
    When I create a task called "Schedule launch review"
    Then I see the task "Schedule launch review"
    And "Schedule launch review" is "To do"

  Scenario: A whitespace-only task title is rejected
    Given I am signed in with the "member" role
    When I submit a task title with only spaces
    Then the editor asks for a task title

  Scenario: A member edits an existing task
    Given I am signed in with the "member" role with a task called "Review release scope"
    When I rename "Review release scope" to "Confirm release scope"
    Then I see the task "Confirm release scope"
    And I no longer see "Review release scope"

  Scenario: A completed task stays done after reload
    Given I am signed in with the "member" role with a task called "Check handover"
    When I mark "Check handover" as "Done"
    Then "Check handover" is still "Done" after reload

  Scenario: Search and status narrow the task list together
    Given I am signed in with the "member" role
    When I search for "mobile"
    Then only "Audit mobile navigation" is shown
    When I filter to "Done"
    Then no tasks match
    When I clear my search
    Then only "Inventory existing pages" is shown
