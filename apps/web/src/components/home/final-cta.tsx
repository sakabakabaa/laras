import { Link } from 'react-router';
import { ArrowUpRight } from 'lucide-react';

export function FinalCta() {
	return (
		<section className="lp-section lp-final" aria-labelledby="final-title">
			<div className="lp-wrap lp-final-inner">
				<div data-lp-reveal>
					<h2 id="final-title">
						Belajar bahasa.
						<br />
						Mengajar lebih cerdas.
					</h2>
					<p>
						Satukan pembelajaran, tugas, evaluasi, dan AI dalam satu ruang kerja —
						dibangun untuk dosen dan mahasiswa Indonesia.
					</p>
					<p className="about">
						AI membantu. Dosen tetap memutuskan.
					</p>
				</div>
				<div data-lp-reveal style={{ '--d': '.1s' }}>
					<div className="ctas">
						<Link to="/login" className="lp-btn lp-btn-white">
							Mulai dengan LARAS <ArrowUpRight size={17} />
						</Link>
						<Link to="/#platform" className="lp-btn lp-btn-outline-w">
							Pelajari fitur
						</Link>
					</div>
				</div>
			</div>
		</section>
	);
}
