import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

export default async function handler(req, res) {
  const authHeader = req.headers.authorization
  const querySecret = req.query.secret

  const authorized =
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    querySecret === process.env.CRON_SECRET

  if (!authorized) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized'
    })
  }

  try {
    const apiResponse = await fetch(
      'https://v3.football.api-sports.io/fixtures?live=all',
      {
        headers: {
          'x-apisports-key': process.env.API_FOOTBALL_KEY
        }
      }
    )

    const apiData = await apiResponse.json()

    const fixtures = (apiData.response || []).map(item => ({
      id: item.fixture.id,
      date: item.fixture.date,
      league: item.league.name,
      home: item.teams.home.name,
      away: item.teams.away.name,
      status: item.fixture.status.short,
      minute: item.fixture.status.elapsed,
      goals_home: item.goals.home,
      goals_away: item.goals.away,
      updated_at: new Date().toISOString()
    }))

    if (fixtures.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Nenhum jogo ao vivo no momento',
        updated: 0,
        api_results: apiData.results || 0
      })
    }

    const { error } = await supabase
      .from('fixtures')
      .upsert(fixtures, { onConflict: 'id' })

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Erro ao salvar no Supabase',
        details: error
      })
    }

    return res.status(200).json({
      success: true,
      message: 'Jogos ao vivo atualizados com sucesso',
      updated: fixtures.length
    })

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
}
