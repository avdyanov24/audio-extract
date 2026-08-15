import { bytes } from '../format.js';

export default function Result({ file }) {
  return (
    <div className="result">
      <div className="file">
        <span className="name">{file.name}</span>
        <span className="size">{bytes(file.size)}</span>
      </div>
      <a className="btn btn-primary" href={file.url} download={file.name}>
        Download
      </a>
    </div>
  );
}
