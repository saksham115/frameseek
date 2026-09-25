// Service Bus — durable queue that triggers the worker Container Apps Job.
// Dead-lettering gives us the stale-job safety net the old ARQ pipeline lacked.
param location string
param tags object
param namePrefix string
param resourceToken string

@description('Managed identity principal granted Service Bus Data Owner.')
param principalId string

resource namespace 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
  name: 'sb-${namePrefix}-${resourceToken}'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    minimumTlsVersion: '1.2'
    disableLocalAuth: true
  }
}

resource queue 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = {
  parent: namespace
  name: 'video-processing'
  properties: {
    maxDeliveryCount: 5
    lockDuration: 'PT5M'
    deadLetteringOnMessageExpiration: true
    defaultMessageTimeToLive: 'P1D'
  }
}

var dataOwnerRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '090c5cfd-751d-490a-894a-3ce6f1109419')

resource dataOwner 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: namespace
  name: guid(namespace.id, principalId, dataOwnerRoleId)
  properties: {
    roleDefinitionId: dataOwnerRoleId
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}

output namespaceFqdn string = replace(replace(namespace.properties.serviceBusEndpoint, 'https://', ''), ':443/', '')
output queueName string = queue.name
