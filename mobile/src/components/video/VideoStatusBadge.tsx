import React from 'react';
import Badge from '../common/Badge';

interface VideoStatusBadgeProps {
  status: string;
}

export default function VideoStatusBadge({ status }: VideoStatusBadgeProps) {
  const variant =
    status === 'ready' ? 'success' :
    status === 'error' ? 'error' :
    status === 'processing' || status === 'queued' ? 'amber' :
    'default';

  return <Badge label={status} variant={variant} />;
}
