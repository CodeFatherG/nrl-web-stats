/**
 * D1PlayerNameLinkRepository — persists confirmed player name links between
 * nrl.com players and nrlsupercoachstats.com names.
 */

export interface PlayerNameLink {
  readonly playerId: string;
  readonly playerName: string;
  readonly teamCode: string;
  readonly supplementaryName: string;
  readonly confidence: string;
  readonly source: 'auto' | 'manual';
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export class D1PlayerNameLinkRepository {
  constructor(private readonly db: D1Database) {}

  async findByPlayerId(playerId: string): Promise<PlayerNameLink | null> {
    const row = await this.db
      .prepare(
        `SELECT player_id, player_name, team_code, supplementary_name, confidence, source, created_at, updated_at
        FROM player_name_links WHERE player_id = ?`
      )
      .bind(playerId)
      .first<DbRow>();

    return row ? this.mapRow(row) : null;
  }

  async findAll(): Promise<PlayerNameLink[]> {
    const result = await this.db
      .prepare(
        `SELECT player_id, player_name, team_code, supplementary_name, confidence, source, created_at, updated_at
        FROM player_name_links ORDER BY player_name`
      )
      .all<DbRow>();

    return (result.results ?? []).map(this.mapRow);
  }

  async save(link: PlayerNameLink): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO player_name_links (player_id, player_name, team_code, supplementary_name, confidence, source, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(player_id) DO UPDATE SET
          player_name = excluded.player_name,
          team_code = excluded.team_code,
          supplementary_name = excluded.supplementary_name,
          confidence = excluded.confidence,
          source = excluded.source,
          updated_at = excluded.updated_at`
      )
      .bind(
        link.playerId,
        link.playerName,
        link.teamCode,
        link.supplementaryName,
        link.confidence,
        link.source
      )
      .run();
  }

  async saveBatch(links: PlayerNameLink[]): Promise<void> {
    if (links.length === 0) return;

    const statements = links.map(link =>
      this.db
        .prepare(
          `INSERT INTO player_name_links (player_id, player_name, team_code, supplementary_name, confidence, source, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(player_id) DO UPDATE SET
            player_name = excluded.player_name,
            team_code = excluded.team_code,
            supplementary_name = excluded.supplementary_name,
            confidence = excluded.confidence,
            source = excluded.source,
            updated_at = excluded.updated_at`
        )
        .bind(
          link.playerId,
          link.playerName,
          link.teamCode,
          link.supplementaryName,
          link.confidence,
          link.source
        )
    );

    await this.db.batch(statements);
  }

  async delete(playerId: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM player_name_links WHERE player_id = ?')
      .bind(playerId)
      .run();
  }

  private mapRow(row: DbRow): PlayerNameLink {
    return {
      playerId: row.player_id,
      playerName: row.player_name,
      teamCode: row.team_code,
      supplementaryName: row.supplementary_name,
      confidence: row.confidence,
      source: row.source as 'auto' | 'manual',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

interface DbRow {
  player_id: string;
  player_name: string;
  team_code: string;
  supplementary_name: string;
  confidence: string;
  source: string;
  created_at: string;
  updated_at: string;
}
