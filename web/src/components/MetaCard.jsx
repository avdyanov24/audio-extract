import { count, duration, uploadDate } from '../format.js';

export default function MetaCard({ info, live }) {
  const facts = [
    duration(info.duration),
    info.uploader,
    count(info.viewCount) && `${count(info.viewCount)} views`,
    uploadDate(info.uploadDate),
  ].filter(Boolean);

  return (
    <div className="panel meta">
      {info.thumbnail ? (
        <img className={live ? 'thumb live' : 'thumb'} src={info.thumbnail} alt="" />
      ) : (
        <div className="thumb" />
      )}
      <div>
        <h2>{info.title}</h2>
        <div className="facts">
          {facts.map((fact) => (
            <span key={fact}>{fact}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
