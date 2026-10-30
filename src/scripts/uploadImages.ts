import fs from "node:fs";
import path from "node:path";
import prisma from "../lib/prismaClient.ts";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
const MAX_BYTES = 1 * 1024 * 1024; // 1 MB

/*my file path from C:Downloads;
node --env-file=.env ./src/scripts/uploadImages.ts "C:\Users\User\Downloads\manman-ecommerce-product"
*/


// Collect every picture inside the folder and its subfolders
function findImages(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return findImages(fullPath);
    return path.extname(entry.name).toLowerCase() in MIME_TYPES ? [fullPath] : [];
  });
}

async function main(): Promise<void> {
  const rootDir = process.argv[2];
  if (!rootDir) {
    console.error('Usage: node --env-file=.env ./src/scripts/uploadImages.ts "<folder path>"');
    process.exitCode = 1;
    return;
  }

  let saved = 0;
  const problems: string[] = [];

  try {
    for (const file of findImages(rootDir)) {

//==={ ext gets the extension like 'jpg', productName gets the Picture name while the bytes gets the picture byte size like MB. }=====###
      const ext = path.extname(file).toLowerCase();
      const productName = path.basename(file, ext);
      const bytes = fs.readFileSync(file);


//===={ Check if your picture byte is greater to 1 MB }========================###
      if (bytes.length > MAX_BYTES) {
        problems.push(`${path.basename(file)}: over 1 MB, skipped`);
        continue;
      }

//====={ this code is the one who save and send the picture from data base or postgreSQ }=============###
      const result = await prisma.products.updateMany({
        where: { name: { equals: productName, mode: "insensitive" } }, // this line 'where' finds products whose name equals productName. mode:
        data: {
          image_data: new Uint8Array(bytes),
          image_type: MIME_TYPES[ext],
        },
      });
//==========================================================================###


//==={ so if it's equal to zero there's no file that matches the product name in your database or postgreSQL otherwise it goes to else and SAVED. }====####
      if (result.count === 0) {
        problems.push(`${path.basename(file)}: no product named "${productName}"`);
      } else {
        saved++;
        console.log(`Saved ${path.basename(file)} -> ${productName}`);
      }
    }

//======================================================================###

    
//===== it prints the total save. if there's a problem, it lists each one, so it easy to know exaclty which to fix.====#####
    console.log(`\nDone. ${saved} image(s) saved.`);
    if (problems.length > 0) {
      console.log("Problems:");
      problems.forEach((problem) => console.log(`  - ${problem}`));
    }
//=============================================================================###

//====== runs no matter what, whether the loop succeded or threw an error. $disconnect() - it closes the database connection. without it, the open connection can keep the terminal hanging after the script is done.========#####
  } finally {
    await prisma.$disconnect();
  }
}
//===========================================================================####


//=========main() returns a Promise. If anything unexpected fails (for example, the folder doesn’t exist or the database is unreachable), .catch prints the error and sets the exit code to 1. unknown is TypeScript’s safe type for “I don’t know what was thrown.”====######
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});