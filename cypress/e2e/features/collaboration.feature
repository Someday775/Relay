Feature: Project collaboration and task assignment

  Scenario: An owner shares a project and filters assigned work
    Given I am signed in with the "member" role
    When I open project access
    And I add Jordan Lee as a collaborator
    And I close project access
    And I assign "Review homepage copy" to "Jordan Lee"
    And I filter tasks by assignee "Jordan Lee"
    Then only "Review homepage copy" is shown
    And "Review homepage copy" remains assigned to "Jordan Lee" after reload

  Scenario: A collaborator can update shared tasks but cannot manage access
    Given Jordan Lee has been added to Website refresh
    When Jordan opens the workspace
    Then "Customer onboarding" is absent from my projects
    And Jordan cannot manage project access
    When I mark "Audit mobile navigation" as "Done"
    Then "Audit mobile navigation" is still "Done" after reload

  Scenario: Removing a collaborator clears their assignments and revokes access
    Given Jordan Lee has been added to Website refresh
    And "Review homepage copy" is assigned to Jordan Lee
    When I open the workspace as its owner
    And I open project access
    And I remove Jordan Lee
    And I close project access
    Then "Review homepage copy" is unassigned
    When Jordan opens the workspace
    Then "Website refresh" is absent from my projects
