import { Link } from "react-router-dom";

const NotFound = () => (
  <div className="grid place-items-center py-24 text-center">
    <div>
      <p className="font-mono text-5xl font-bold text-primary">404</p>
      <p className="mt-3 text-muted-foreground">That page doesn’t exist.</p>
      <Link to="/" className="mt-6 inline-block text-primary hover:underline">
        Back to your library
      </Link>
    </div>
  </div>
);

export default NotFound;
