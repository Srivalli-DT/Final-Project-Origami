import { Link } from "react-router-dom";
import Player from "../components/Player";
import GuideActions from "../components/GuideActions";
import { useUpload } from "../store";

export default function GuidePage() {
  const { title, fold, guide } = useUpload();
  if (!fold || !guide)
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p>No crease pattern loaded yet.</p>
        <Link to="/upload" className="btn btn-primary mt-4">
          Upload a crease pattern
        </Link>
      </main>
    );
  return (
    <Player
      title={title}
      fold={fold}
      guide={guide}
      actions={<GuideActions title={title} slug="my-pattern" fold={fold} guide={guide} canSave />}
    />
  );
}
