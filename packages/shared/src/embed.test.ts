import { expect, it } from "vitest";
import { embedOf } from "./embed";

it("turns shared links into players the CRM can show", () => {
  expect(embedOf("https://drive.google.com/file/d/1AbC-xyz_9/view?usp=sharing")?.src).toBe("https://drive.google.com/file/d/1AbC-xyz_9/preview");
  expect(embedOf("https://drive.google.com/open?id=1AbC")?.src).toBe("https://drive.google.com/file/d/1AbC/preview");
  expect(embedOf("https://drive.google.com/drive/folders/1Fold3r?usp=sharing")?.src).toBe("https://drive.google.com/embeddedfolderview?id=1Fold3r#grid");
  expect(embedOf("https://docs.google.com/presentation/d/1Deck/edit#slide=id.p")?.src).toBe("https://docs.google.com/presentation/d/1Deck/preview");
  expect(embedOf("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")?.src).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  expect(embedOf("https://youtu.be/dQw4w9WgXcQ")?.src).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  expect(embedOf("https://youtube.com/shorts/abcDEF12345")?.src).toBe("https://www.youtube.com/embed/abcDEF12345");
  expect(embedOf("https://vimeo.com/123456789")?.src).toBe("https://player.vimeo.com/video/123456789");
  expect(embedOf("https://www.instagram.com/reel/Dfbr8Ify2ti/?igsh=x")?.src).toBe("https://www.instagram.com/reel/Dfbr8Ify2ti/embed");
  expect(embedOf("https://cdn.example.com/a/final.MP4")).toMatchObject({ kind: "video" });
  expect(embedOf("https://cdn.example.com/a/still.jpg")).toMatchObject({ kind: "image" });
  expect(embedOf("https://www.dropbox.com/s/x/film.zip")).toBeUndefined(); // opens in a new tab instead
  expect(embedOf("http://drive.google.com/file/d/1/view")).toBeUndefined(); // not https
  expect(embedOf("not a link")).toBeUndefined();
});
