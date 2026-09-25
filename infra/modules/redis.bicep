// Azure Cache for Redis — rate limiting + SSE job-progress pub/sub.
param location string
param tags object
param namePrefix string
param resourceToken string

resource redis 'Microsoft.Cache/redis@2024-03-01' = {
  name: 'redis-${namePrefix}-${resourceToken}'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'Basic'
      family: 'C'
      capacity: 0
    }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
    redisVersion: '6'
  }
}

output hostName string = redis.properties.hostName
output sslPort int = redis.properties.sslPort
output redisName string = redis.name
