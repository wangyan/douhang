import type { Card as CardType, NetworkMode } from '@/types';

/** 根据网络模式选择卡片 URL */
export function getCardUrl(card: CardType, mode: NetworkMode): string {
  switch (mode) {
    case 'internal':
      return card.internalUrl || card.externalUrl || '';
    case 'external':
      return card.externalUrl || card.internalUrl || '';
    default:
      return card.externalUrl || card.internalUrl || '';
  }
}
