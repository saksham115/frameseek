param location string
param tags object
param namePrefix string
param resourceToken string

resource cache 'Microsoft.Cache/redisEnterprise@2025-07-01' = {
  name: 'redis-${namePrefix}-${resourceToken}'
  location: location
  tags: tags
  sku: { name: 'Balanced_B0' }
  properties: { minimumTlsVersion: '1.2', highAvailability: 'Enabled', publicNetworkAccess: 'Enabled' }
}
resource database 'Microsoft.Cache/redisEnterprise/databases@2025-07-01' = {
  parent: cache
  name: 'default'
  properties: {
    clientProtocol: 'Encrypted'
    port: 10000
    clusteringPolicy: 'EnterpriseCluster'
    evictionPolicy: 'NoEviction'
    accessKeysAuthentication: 'Enabled'
  }
}
output hostName string = cache.properties.hostName
output sslPort int = database.properties.port
output redisName string = cache.name
