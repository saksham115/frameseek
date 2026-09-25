// FrameSeek — Azure infrastructure foundation (Phase 0)
// Resource-group scoped. Deploy with:
//   az group create -n rg-frameseek-prod -l westeurope
//   az deployment group create -g rg-frameseek-prod -f infra/main.bicep -p @infra/main.parameters.json
//
// Networking note: Postgres is fully private (VNet-delegated). KV/Storage/Service Bus/
// Redis/ACR use public endpoints locked down by RBAC + firewall in this foundation;
// private endpoints are listed as a Phase-4 hardening step in infra/README.md.

targetScope = 'resourceGroup'

@description('Primary region for compute, data and storage. EU by default.')
param location string = 'westeurope'

@description('Region for Azure OpenAI (Whisper). Sweden Central has the widest model coverage in the EU.')
param openAiLocation string = 'swedencentral'

@description('Short prefix for resource names.')
param namePrefix string = 'frameseek'

@description('Environment discriminator (prod, staging, dev).')
param environmentName string = 'prod'

@description('PostgreSQL administrator login.')
param postgresAdminUser string = 'fsadmin'

@description('PostgreSQL administrator password. Supply via --parameters or a Key Vault reference; never commit it.')
@secure()
param postgresAdminPassword string

@description('Container image for the API. Placeholder until the first CI build pushes to ACR.')
param apiImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

@description('Container image for the worker job.')
param workerImage string = 'mcr.microsoft.com/k8se/quickstart:latest'

var resourceToken = toLower(uniqueString(resourceGroup().id, environmentName))
var tags = {
  application: 'frameseek'
  environment: environmentName
  managedBy: 'bicep'
}

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    location: location
    tags: tags
    namePrefix: namePrefix
    resourceToken: resourceToken
  }
}

module identity 'modules/identity.bicep' = {
  name: 'identity'
  params: {
    location: location
    tags: tags
    namePrefix: namePrefix
    resourceToken: resourceToken
  }
}

module network 'modules/network.bicep' = {
  name: 'network'
  params: {
    location: location
    tags: tags
    namePrefix: namePrefix
    resourceToken: resourceToken
  }
}

module keyvault 'modules/keyvault.bicep' = {
  name: 'keyvault'
  params: {
    location: location
    tags: tags
    namePrefix: namePrefix
    resourceToken: resourceToken
    principalId: identity.outputs.principalId
  }
}

module acr 'modules/acr.bicep' = {
  name: 'acr'
  params: {
    location: location
    tags: tags
    namePrefix: namePrefix
    resourceToken: resourceToken
    principalId: identity.outputs.principalId
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    location: location
    tags: tags
    namePrefix: namePrefix
    resourceToken: resourceToken
    principalId: identity.outputs.principalId
  }
}

module postgres 'modules/postgres.bicep' = {
  name: 'postgres'
  params: {
    location: location
    tags: tags
    namePrefix: namePrefix
    resourceToken: resourceToken
    adminUser: postgresAdminUser
    adminPassword: postgresAdminPassword
    delegatedSubnetId: network.outputs.postgresSubnetId
    privateDnsZoneId: network.outputs.postgresPrivateDnsZoneId
  }
}

module serviceBus 'modules/servicebus.bicep' = {
  name: 'servicebus'
  params: {
    location: location
    tags: tags
    namePrefix: namePrefix
    resourceToken: resourceToken
    principalId: identity.outputs.principalId
  }
}

module redis 'modules/redis.bicep' = {
  name: 'redis'
  params: {
    location: location
    tags: tags
    namePrefix: namePrefix
    resourceToken: resourceToken
  }
}

module ai 'modules/ai.bicep' = {
  name: 'ai'
  params: {
    location: location
    openAiLocation: openAiLocation
    tags: tags
    namePrefix: namePrefix
    resourceToken: resourceToken
    principalId: identity.outputs.principalId
  }
}

module apps 'modules/containerapps.bicep' = {
  name: 'containerapps'
  params: {
    location: location
    tags: tags
    namePrefix: namePrefix
    resourceToken: resourceToken
    infraSubnetId: network.outputs.infraSubnetId
    logAnalyticsCustomerId: monitoring.outputs.logAnalyticsCustomerId
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    identityId: identity.outputs.identityId
    identityClientId: identity.outputs.clientId
    acrLoginServer: acr.outputs.loginServer
    apiImage: apiImage
    workerImage: workerImage
    serviceBusFqdn: serviceBus.outputs.namespaceFqdn
    serviceBusQueueName: serviceBus.outputs.queueName
    keyVaultUri: keyvault.outputs.vaultUri
  }
}

output resourceToken string = resourceToken
output acrLoginServer string = acr.outputs.loginServer
output apiFqdn string = apps.outputs.apiFqdn
output keyVaultName string = keyvault.outputs.vaultName
output storageAccountName string = storage.outputs.accountName
output postgresFqdn string = postgres.outputs.fqdn
output managedIdentityClientId string = identity.outputs.clientId
output openAiEndpoint string = ai.outputs.openAiEndpoint
output visionEndpoint string = ai.outputs.visionEndpoint
