import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import styles from './page.module.css'

export default function Home() {
  return (
    <main className={styles.main}>
      <div className={styles.hero}>
        <div className={styles.badgeGroup}>
          <Badge variant="status">PILOTO 2026</Badge>
          <Badge variant="MEI">SÉRIE A</Badge>
        </div>

        <h1 className={styles.title}>
          Fantasy Draft <span className={styles.highlight}>2026</span>
        </h1>

        <p className={styles.subtitle}>
          Liga fechada com draft snake, elenco exclusivo por liga e pontuação estilo Cartola FC.
        </p>

        <div className={styles.actions}>
          <a href="/login">
            <Button size="lg">Criar ou Entrar em Liga</Button>
          </a>
        </div>

        <div className={styles.positionsPreview}>
          <Badge variant="GOL">GOL</Badge>
          <Badge variant="LAT">LAT</Badge>
          <Badge variant="ZAG">ZAG</Badge>
          <Badge variant="MEI">MEI</Badge>
          <Badge variant="ATA">ATA</Badge>
        </div>
      </div>
    </main>
  )
}
