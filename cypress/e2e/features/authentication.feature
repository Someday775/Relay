Feature: Workspace authentication

  Scenario: Member signs in and signs out
    Given the sign-in page is open
    When the member signs in with valid credentials
    Then the member workspace is visible
    When the member signs out
    Then the sign-in page is shown and the workspace requires authentication

  Scenario: Incorrect credentials are rejected
    Given the sign-in page is open
    When the member signs in with an incorrect password
    Then the sign-in form explains that the credentials are incorrect
