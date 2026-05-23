import type { DrawDataSource } from '../../domain/ports/draw-data-source.js';
import type { MatchRepository } from '../../domain/repositories/match-repository.js';
import type { FixtureRepository } from '../../domain/repositories/fixture-repository.js';
import type { ScrapeDrawResult } from '../results/scrape-result.js';
import { buildFixturesFromMatches } from '../../database/legacy-fixture-bridge.js';

export class ScrapeDrawUseCase {
  constructor(
    private readonly fixtureRepository: FixtureRepository,
    private readonly dataSource: DrawDataSource,
    private readonly matchRepository: MatchRepository,
  ) {}

  async execute(year: number, _force?: boolean): Promise<ScrapeDrawResult> {
    const result = await this.dataSource.fetchDraw(year);
    if (!result.success) {
      throw new Error(result.error);
    }

    await this.matchRepository.saveAll(result.data);

    const fixtures = buildFixturesFromMatches(year, result.data);
    await this.fixtureRepository.save(year, fixtures);

    return {
      success: true,
      year,
      fixturesLoaded: fixtures.length,
      fromCache: false,
      isStale: false,
    };
  }
}
