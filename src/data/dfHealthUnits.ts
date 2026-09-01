import type { Coordinates } from '../types';

export type DfHealthUnitKind =
  'UBS' | 'Posto' | 'Hospital' | 'UPA' | 'CAPS' | 'Pronto-Socorro' | 'Unidade Mista';

// Uma unidade pública de saúde do DF, destilada do CNES/DATASUS pelo
// script `scripts/generate-unidades-saude.mjs`. Ver
// `src/data/dfHealthUnits.generated.ts` (dados) e a função
// `searchDfHealthUnits` (busca local em cima desses dados).
export interface DfHealthUnit {
  /** `cnes-${CO_CNES}` — ou `manual-*` para entradas de override. */
  id: string;
  /** Rótulo pronto para a lista de sugestões ("Nome, Rua, Bairro, Brasília - DF"). */
  displayName: string;
  kind: DfHealthUnitKind;
  /** Região Administrativa, ex.: "Guará". */
  ra: string;
  /** Sempre presente — unidades sem coordenada utilizável são excluídas na geração. */
  coordinates: Coordinates;
  /** String normalizada com nome + apelidos; casada por substring de token. */
  searchText: string;
}
