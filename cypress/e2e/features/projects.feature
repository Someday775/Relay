Feature: Project creation and access

  Scenario: A member creates a project
    Given I am signed in with the "member" role
    When I create a project called "Release planning"
    Then "Release planning" is selected and has no tasks

  Scenario: A whitespace-only project name is rejected
    Given I am signed in with the "member" role
    When I submit a project name with only spaces
    Then the editor asks for a project name

  Scenario: A member cannot view or change an admin project
    Given I am signed in with the "member" role
    Then "Customer onboarding" is absent from my projects
    And a request to update its task is rejected

  Scenario: An admin can see tasks in another user's project
    Given I am signed in with the "admin" role
    When I select "Website refresh"
    Then I see the task "Review homepage copy"
    When I select "Customer onboarding"
    Then I see the task "Draft welcome checklist"
