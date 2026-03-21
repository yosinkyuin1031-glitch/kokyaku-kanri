import { NextRequest, NextResponse } from 'next/server'

// In-memory cache for geocoding results (survives across requests in same server instance)
const geocodeCache = new Map<string, { lat: number; lng: number } | null>()

// Well-known Japanese city coordinates for fast lookup (no API needed)
const KNOWN_CITIES: Record<string, { lat: number; lng: number }> = {
  // 東京都
  '東京都千代田区': { lat: 35.6938, lng: 139.7535 },
  '東京都中央区': { lat: 35.6707, lng: 139.7722 },
  '東京都港区': { lat: 35.6581, lng: 139.7514 },
  '東京都新宿区': { lat: 35.6938, lng: 139.7036 },
  '東京都文京区': { lat: 35.7081, lng: 139.7522 },
  '東京都台東区': { lat: 35.7124, lng: 139.7800 },
  '東京都墨田区': { lat: 35.7107, lng: 139.8015 },
  '東京都江東区': { lat: 35.6729, lng: 139.8173 },
  '東京都品川区': { lat: 35.6094, lng: 139.7303 },
  '東京都目黒区': { lat: 35.6414, lng: 139.6982 },
  '東京都大田区': { lat: 35.5613, lng: 139.7160 },
  '東京都世田谷区': { lat: 35.6461, lng: 139.6532 },
  '東京都渋谷区': { lat: 35.6640, lng: 139.6982 },
  '東京都中野区': { lat: 35.7078, lng: 139.6638 },
  '東京都杉並区': { lat: 35.6995, lng: 139.6364 },
  '東京都豊島区': { lat: 35.7263, lng: 139.7163 },
  '東京都北区': { lat: 35.7528, lng: 139.7375 },
  '東京都荒川区': { lat: 35.7360, lng: 139.7834 },
  '東京都板橋区': { lat: 35.7515, lng: 139.7090 },
  '東京都練馬区': { lat: 35.7355, lng: 139.6516 },
  '東京都足立区': { lat: 35.7750, lng: 139.8047 },
  '東京都葛飾区': { lat: 35.7439, lng: 139.8474 },
  '東京都江戸川区': { lat: 35.7067, lng: 139.8683 },
  // 東京都 市部
  '東京都八王子市': { lat: 35.6554, lng: 139.3389 },
  '東京都立川市': { lat: 35.7138, lng: 139.4093 },
  '東京都武蔵野市': { lat: 35.7174, lng: 139.5664 },
  '東京都三鷹市': { lat: 35.6836, lng: 139.5597 },
  '東京都府中市': { lat: 35.6689, lng: 139.4778 },
  '東京都調布市': { lat: 35.6525, lng: 139.5419 },
  '東京都町田市': { lat: 35.5484, lng: 139.4386 },
  '東京都小金井市': { lat: 35.6992, lng: 139.5038 },
  '東京都小平市': { lat: 35.7285, lng: 139.4775 },
  '東京都日野市': { lat: 35.6713, lng: 139.3949 },
  '東京都東村山市': { lat: 35.7547, lng: 139.4684 },
  '東京都国分寺市': { lat: 35.7107, lng: 139.4622 },
  '東京都国立市': { lat: 35.6838, lng: 139.4414 },
  '東京都西東京市': { lat: 35.7258, lng: 139.5386 },
  '東京都狛江市': { lat: 35.6336, lng: 139.5781 },
  '東京都東大和市': { lat: 35.7455, lng: 139.4268 },
  '東京都清瀬市': { lat: 35.7714, lng: 139.5182 },
  '東京都東久留米市': { lat: 35.7589, lng: 139.5296 },
  '東京都多摩市': { lat: 35.6369, lng: 139.4463 },
  '東京都稲城市': { lat: 35.6380, lng: 139.5046 },
  '東京都羽村市': { lat: 35.7681, lng: 139.3115 },
  '東京都あきる野市': { lat: 35.7292, lng: 139.2945 },
  '東京都福生市': { lat: 35.7388, lng: 139.3266 },
  '東京都昭島市': { lat: 35.7058, lng: 139.3535 },
  '東京都武蔵村山市': { lat: 35.7544, lng: 139.3876 },
  // 神奈川県
  '神奈川県横浜市': { lat: 35.4437, lng: 139.6380 },
  '神奈川県川崎市': { lat: 35.5309, lng: 139.7029 },
  '神奈川県相模原市': { lat: 35.5714, lng: 139.3734 },
  '神奈川県藤沢市': { lat: 35.3389, lng: 139.4900 },
  '神奈川県横須賀市': { lat: 35.2793, lng: 139.6722 },
  '神奈川県平塚市': { lat: 35.3267, lng: 139.3498 },
  '神奈川県茅ヶ崎市': { lat: 35.3339, lng: 139.4039 },
  '神奈川県大和市': { lat: 35.4674, lng: 139.4619 },
  '神奈川県厚木市': { lat: 35.4413, lng: 139.3659 },
  '神奈川県海老名市': { lat: 35.4529, lng: 139.3905 },
  '神奈川県座間市': { lat: 35.4889, lng: 139.4081 },
  '神奈川県小田原市': { lat: 35.2643, lng: 139.1520 },
  '神奈川県鎌倉市': { lat: 35.3192, lng: 139.5467 },
  '神奈川県秦野市': { lat: 35.3732, lng: 139.2266 },
  '神奈川県伊勢原市': { lat: 35.3977, lng: 139.3148 },
  '神奈川県綾瀬市': { lat: 35.4378, lng: 139.4268 },
  // 埼玉県
  '埼玉県さいたま市': { lat: 35.8617, lng: 139.6455 },
  '埼玉県川口市': { lat: 35.8076, lng: 139.7241 },
  '埼玉県川越市': { lat: 35.9251, lng: 139.4857 },
  '埼玉県所沢市': { lat: 35.7996, lng: 139.4690 },
  '埼玉県越谷市': { lat: 35.8910, lng: 139.7905 },
  '埼玉県草加市': { lat: 35.8264, lng: 139.8053 },
  '埼玉県春日部市': { lat: 35.9757, lng: 139.7527 },
  '埼玉県上尾市': { lat: 35.9774, lng: 139.5934 },
  '埼玉県熊谷市': { lat: 36.1472, lng: 139.3885 },
  '埼玉県新座市': { lat: 35.7930, lng: 139.5658 },
  '埼玉県朝霞市': { lat: 35.7972, lng: 139.5930 },
  '埼玉県志木市': { lat: 35.8374, lng: 139.5802 },
  '埼玉県和光市': { lat: 35.7813, lng: 139.6066 },
  '埼玉県富士見市': { lat: 35.8572, lng: 139.5494 },
  '埼玉県ふじみ野市': { lat: 35.8795, lng: 139.5197 },
  '埼玉県入間市': { lat: 35.8359, lng: 139.3910 },
  '埼玉県狭山市': { lat: 35.8527, lng: 139.4123 },
  '埼玉県飯能市': { lat: 35.8559, lng: 139.3297 },
  // 千葉県
  '千葉県千葉市': { lat: 35.6073, lng: 140.1063 },
  '千葉県船橋市': { lat: 35.6946, lng: 139.9827 },
  '千葉県柏市': { lat: 35.8678, lng: 139.9716 },
  '千葉県松戸市': { lat: 35.7875, lng: 139.9031 },
  '千葉県市川市': { lat: 35.7220, lng: 139.9309 },
  '千葉県浦安市': { lat: 35.6535, lng: 139.9017 },
  // 大阪府
  '大阪府大阪市': { lat: 34.6937, lng: 135.5023 },
  '大阪府堺市': { lat: 34.5733, lng: 135.4833 },
  '大阪府豊中市': { lat: 34.7814, lng: 135.4700 },
  // 愛知県
  '愛知県名古屋市': { lat: 35.1815, lng: 136.9066 },
  // 福岡県
  '福岡県福岡市': { lat: 33.5902, lng: 130.4017 },
  // 北海道
  '北海道札幌市': { lat: 43.0618, lng: 141.3545 },
  // 宮城県
  '宮城県仙台市': { lat: 38.2682, lng: 140.8694 },
  // 広島県
  '広島県広島市': { lat: 34.3853, lng: 132.4553 },
  // 京都府
  '京都府京都市': { lat: 35.0116, lng: 135.7681 },
  // 兵庫県
  '兵庫県神戸市': { lat: 34.6901, lng: 135.1956 },
}

// Prefecture center coordinates as fallback
const PREF_CENTERS: Record<string, { lat: number; lng: number }> = {
  '北海道': { lat: 43.06, lng: 141.35 },
  '青森県': { lat: 40.82, lng: 140.74 },
  '岩手県': { lat: 39.70, lng: 141.15 },
  '宮城県': { lat: 38.27, lng: 140.87 },
  '秋田県': { lat: 39.72, lng: 140.10 },
  '山形県': { lat: 38.24, lng: 140.34 },
  '福島県': { lat: 37.75, lng: 140.47 },
  '茨城県': { lat: 36.34, lng: 140.45 },
  '栃木県': { lat: 36.57, lng: 139.88 },
  '群馬県': { lat: 36.39, lng: 139.06 },
  '埼玉県': { lat: 35.86, lng: 139.65 },
  '千葉県': { lat: 35.61, lng: 140.12 },
  '東京都': { lat: 35.68, lng: 139.69 },
  '神奈川県': { lat: 35.45, lng: 139.64 },
  '新潟県': { lat: 37.90, lng: 139.02 },
  '富山県': { lat: 36.70, lng: 137.21 },
  '石川県': { lat: 36.59, lng: 136.63 },
  '福井県': { lat: 36.07, lng: 136.22 },
  '山梨県': { lat: 35.66, lng: 138.57 },
  '長野県': { lat: 36.23, lng: 138.18 },
  '岐阜県': { lat: 35.39, lng: 136.72 },
  '静岡県': { lat: 34.98, lng: 138.38 },
  '愛知県': { lat: 35.18, lng: 136.91 },
  '三重県': { lat: 34.73, lng: 136.51 },
  '滋賀県': { lat: 35.00, lng: 135.87 },
  '京都府': { lat: 35.02, lng: 135.76 },
  '大阪府': { lat: 34.69, lng: 135.52 },
  '兵庫県': { lat: 34.69, lng: 135.18 },
  '奈良県': { lat: 34.69, lng: 135.83 },
  '和歌山県': { lat: 34.23, lng: 135.17 },
  '鳥取県': { lat: 35.50, lng: 134.24 },
  '島根県': { lat: 35.47, lng: 133.05 },
  '岡山県': { lat: 34.66, lng: 133.93 },
  '広島県': { lat: 34.40, lng: 132.46 },
  '山口県': { lat: 34.19, lng: 131.47 },
  '徳島県': { lat: 34.07, lng: 134.56 },
  '香川県': { lat: 34.34, lng: 134.04 },
  '愛媛県': { lat: 33.84, lng: 132.77 },
  '高知県': { lat: 33.56, lng: 133.53 },
  '福岡県': { lat: 33.59, lng: 130.42 },
  '佐賀県': { lat: 33.25, lng: 130.30 },
  '長崎県': { lat: 32.74, lng: 129.87 },
  '熊本県': { lat: 32.79, lng: 130.74 },
  '大分県': { lat: 33.24, lng: 131.61 },
  '宮崎県': { lat: 31.91, lng: 131.42 },
  '鹿児島県': { lat: 31.56, lng: 130.56 },
  '沖縄県': { lat: 26.34, lng: 127.80 },
}

async function geocodeWithNominatim(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=jp`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'customer-mgmt-app/1.0' },
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
    }
    return null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const { cities } = await request.json() as { cities: { prefecture: string; city: string }[] }

    if (!cities || !Array.isArray(cities)) {
      return NextResponse.json({ error: 'cities array required' }, { status: 400 })
    }

    const results: Record<string, { lat: number; lng: number } | null> = {}

    for (const { prefecture, city } of cities) {
      const key = `${prefecture}${city}`

      // Check memory cache
      if (geocodeCache.has(key)) {
        results[key] = geocodeCache.get(key)!
        continue
      }

      // Check known cities lookup
      if (KNOWN_CITIES[key]) {
        results[key] = KNOWN_CITIES[key]
        geocodeCache.set(key, KNOWN_CITIES[key])
        continue
      }

      // Try Nominatim for unknown cities
      const coords = await geocodeWithNominatim(`${prefecture}${city}`)
      if (coords) {
        results[key] = coords
        geocodeCache.set(key, coords)
      } else {
        // Fallback to prefecture center
        const prefCoords = PREF_CENTERS[prefecture] || null
        results[key] = prefCoords
        geocodeCache.set(key, prefCoords)
      }

      // Rate limit: 1 req/sec for Nominatim
      await new Promise(r => setTimeout(r, 1100))
    }

    return NextResponse.json({ results })
  } catch (err) {
    return NextResponse.json({ error: 'Geocoding failed' }, { status: 500 })
  }
}
