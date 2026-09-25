// Phase 1: production services. Reuses existing Azure AI; does not create AI models.
targetScope = 'resourceGroup'
param location string = 'centralindia'
param namePrefix string = 'fs'
param postgresAdminUser string = 'fsadmin'
@secure()
param postgresAdminPassword string
@secure()
param jwtSecret string
@secure()
param googleClientSecret string
param deployerObjectId string

var token = toLower(uniqueString(resourceGroup().id, 'prod'))
var tags = { application: 'frameseek', environment: 'prod', managedBy: 'bicep' }

module monitor 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: { location: location, tags: tags, namePrefix: namePrefix, resourceToken: token }
}
module identity 'modules/identity.bicep' = {
  name: 'identity'
  params: { location: location, tags: tags, namePrefix: namePrefix, resourceToken: token }
}
module network 'modules/network.bicep' = {
  name: 'network'
  params: { location: location, tags: tags, namePrefix: namePrefix, resourceToken: token }
}
module vault 'modules/keyvault.bicep' = {
  name: 'keyvault'
  params: { location: location, tags: tags, namePrefix: namePrefix, resourceToken: token, principalId: identity.outputs.principalId }
}
module registry 'modules/acr.bicep' = {
  name: 'registry'
  params: { location: location, tags: tags, namePrefix: namePrefix, resourceToken: token, principalId: identity.outputs.principalId, skuName: 'Basic' }
}
module blob 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    location: location
    tags: tags
    namePrefix: namePrefix
    resourceToken: token
    principalId: identity.outputs.principalId
    allowedOrigins: ['https://frameseek-web.${environment.outputs.defaultDomain}']
  }
}
module postgres 'modules/postgres.bicep' = {
  name: 'postgres'
  params: {
    location: location
    tags: tags
    namePrefix: namePrefix
    resourceToken: token
    adminUser: postgresAdminUser
    adminPassword: postgresAdminPassword
    delegatedSubnetId: network.outputs.postgresSubnetId
    privateDnsZoneId: network.outputs.postgresPrivateDnsZoneId
    skuName: 'Standard_B2s'
    skuTier: 'Burstable'
  }
}
module queue 'modules/servicebus.bicep' = {
  name: 'servicebus'
  params: { location: location, tags: tags, namePrefix: namePrefix, resourceToken: token, principalId: identity.outputs.principalId }
}
module cache 'modules/managed-redis.bicep' = {
  name: 'redis'
  params: { location: location, tags: tags, namePrefix: namePrefix, resourceToken: token }
}
module environment 'modules/environment.bicep' = {
  name: 'environment'
  params: {
    location: location
    name: 'cae-${namePrefix}-${token}'
    tags: tags
    infraSubnetId: network.outputs.infraSubnetId
    logAnalyticsCustomerId: monitor.outputs.logAnalyticsCustomerId
    logAnalyticsWorkspaceId: monitor.outputs.logAnalyticsWorkspaceId
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = { name: 'kv-${namePrefix}-${token}' }
resource redis 'Microsoft.Cache/redisEnterprise@2025-07-01' existing = { name: 'redis-${namePrefix}-${token}' }
resource redisDatabase 'Microsoft.Cache/redisEnterprise/databases@2025-07-01' existing = { parent: redis, name: 'default' }
resource databaseSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'postgres-connection-string'
  properties: { value: 'postgresql+asyncpg://${postgresAdminUser}:${uriComponent(postgresAdminPassword)}@${postgres.outputs.fqdn}:5432/frameseek' }
  dependsOn: [vault]
}
resource redisSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'redis-connection-string'
  properties: { value: 'rediss://:${uriComponent(redisDatabase.listKeys().primaryKey)}@${cache.outputs.hostName}:${cache.outputs.sslPort}/0' }
  dependsOn: [vault, cache]
}
resource jwt 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'jwt-secret'
  properties: { value: jwtSecret }
  dependsOn: [vault]
}
resource google 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'google-oauth-client-secret'
  properties: { value: googleClientSecret }
  dependsOn: [vault]
}
resource deployerSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  dependsOn: [vault]
  scope: keyVault
  name: guid(keyVault.id, deployerObjectId, 'secrets-officer')
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7')
    principalId: deployerObjectId
    principalType: 'User'
  }
}
output environmentId string = environment.outputs.id
output defaultDomain string = environment.outputs.defaultDomain
output identityId string = identity.outputs.identityId
output identityClientId string = identity.outputs.clientId
output identityPrincipalId string = identity.outputs.principalId
output acrName string = registry.outputs.registryName
output acrLoginServer string = registry.outputs.loginServer
output keyVaultUri string = vault.outputs.vaultUri
output keyVaultName string = vault.outputs.vaultName
output storageAccountName string = blob.outputs.accountName
output blobEndpoint string = blob.outputs.blobEndpoint
output postgresFqdn string = postgres.outputs.fqdn
output serviceBusFqdn string = queue.outputs.namespaceFqdn
output appInsightsConnectionString string = monitor.outputs.appInsightsConnectionString
