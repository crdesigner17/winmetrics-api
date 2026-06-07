import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

function getTodayBrazilDate() {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })

  return formatter.format(now)
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization
  const querySecret = req.query.secret

  const authorized =
  authHeader === `Bearer ${process.env.CRON_SECRET}` ||
  querySecret === process.env.CRON_SECRET ||
  req.headers['user-agent']?.includes('vercel-cron')

  if (!authorized) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized'
    })
  }

  try {
    const date = req.query.date || getTodayBrazilDate()

    const apiResponse = await fetch(
      `https://v3.football.api-sports.io/fixtures?date=${date}`,
      {
        headers: {
          'x-apisports-key': process.env.API_FOOTBALL_KEY
        }
      }
    )

    const apiData = await apiResponse.json()

    const finishedStatuses = ['FT', 'AET', 'PEN']

    const finishedFixtures = (apiData.response || [])
      .filter(item => finishedStatuses.includes(item.fixture.status.short))
      .map(item => ({
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

    if (finishedFixtures.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Nenhum jogo finalizado encontrado',
        date,
        updated: 0
      })
    }

    const { error } = await supabase
      .from('fixtures')
      .upsert(finishedFixtures, { onConflict: 'id' })

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Erro ao salvar resultados no Supabase',
        details: error
      })
    }

    return res.status(200).json({
      success: true,
      message: 'Resultados atualizados com sucesso',
      date,
      updated: finishedFixtures.length
    })

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
}
