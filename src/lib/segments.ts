import type { ClientSegment } from './types';

/** Áreas de cliente (cadastro do cliente e banco de ideias). */
export const SEGMENTS: [Exclude<ClientSegment, ''>, string][] = [
  ['saude', 'Saúde'], ['gastronomia', 'Gastronomia'], ['beleza', 'Área da beleza'], ['empresas', 'Empresas / B2B'], ['outra', 'Outra'],
];

export const segmentLabel = (s: string | null | undefined) =>
  SEGMENTS.find(([k]) => k === s)?.[1] ?? 'Sem área definida';
