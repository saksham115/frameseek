// User-assigned managed identity: replaces the service-account.json key file.
// The API and worker both run as this identity and reach Blob/AI/Service Bus/KV via RBAC.
param location string
param tags object
param namePrefix string
param resourceToken string

resource uami 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${namePrefix}-${resourceToken}'
  location: location
  tags: tags
}

output identityId string = uami.id
output principalId string = uami.properties.principalId
output clientId string = uami.properties.clientId
output name string = uami.name
