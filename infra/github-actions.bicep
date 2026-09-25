// One-time GitHub OIDC setup for releases from this repository's main branch.
targetScope = 'resourceGroup'

param githubRepository string = 'saksham115/frameseek'
param identityName string = 'id-frameseek-github'
param acrName string = 'acrfsg7unyr2nlrdvk'
param environmentName string = 'cae-fs-g7unyr2nlrdvk'
param runtimeIdentityName string = 'id-fs-g7unyr2nlrdvk'

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: resourceGroup().location
}

resource mainCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: identity
  name: 'github-main'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:${githubRepository}:ref:refs/heads/main'
    audiences: ['api://AzureADTokenExchange']
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}
resource environment 'Microsoft.App/managedEnvironments@2024-03-01' existing = {
  name: environmentName
}
resource runtimeIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: runtimeIdentityName
}
var appNames = ['frameseek-api', 'frameseek-web']
var jobNames = ['frameseek-worker', 'frameseek-migrate']
resource apps 'Microsoft.App/containerApps@2024-03-01' existing = [for name in appNames: {
  name: name
}]
resource jobs 'Microsoft.App/jobs@2024-03-01' existing = [for name in jobNames: {
  name: name
}]

// Read resource metadata; no database, Blob, Key Vault or role-management access.
resource reader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, identity.id, 'reader')
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'acdd72a7-3385-48ef-bd42-f606fba81ae7')
  }
}
resource builds 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, identity.id, 'tasks-contributor')
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'fb382eab-e894-4461-af04-94435c366c3f')
  }
}
resource appDeploys 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for (name, i) in appNames: {
  scope: apps[i]
  name: guid(apps[i].id, identity.id, 'app-contributor')
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '358470bc-b998-42bd-ab17-a7e34c199c0f')
  }
}]
resource jobDeploys 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for (name, i) in jobNames: {
  scope: jobs[i]
  name: guid(jobs[i].id, identity.id, 'job-contributor')
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4e3d2b60-56ae-4dc6-a233-09c8e5a82e68')
  }
}]
resource environmentJoin 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: environment
  name: guid(environment.id, identity.id, 'environment-join')
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '358470bc-b998-42bd-ab17-a7e34c199c0f')
  }
}
resource assignRuntimeIdentity 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: runtimeIdentity
  name: guid(runtimeIdentity.id, identity.id, 'identity-operator')
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'f1a07417-d97a-45cb-824c-7a7467783830')
  }
}

output clientId string = identity.properties.clientId
output tenantId string = tenant().tenantId
output subscriptionId string = subscription().subscriptionId
