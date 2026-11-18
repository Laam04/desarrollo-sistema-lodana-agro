export const shipmentStatusLabels: Record<string, string> = {
  IN_TRANSIT: 'En tránsito',
  ACTIVE: 'En tránsito',
  PARTIALLY_RECEIVED: 'Recepción parcial',
  RECEIVED: 'Recibido',
  RECEIVED_WITH_DIFFERENCES: 'Cerrado con diferencias',
  CANCELLED: 'Cancelado',
}

export const editableShipmentStatuses = ['IN_TRANSIT', 'ACTIVE']
export const receivableStatuses = [...editableShipmentStatuses, 'PARTIALLY_RECEIVED']
