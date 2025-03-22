// controllers/relativeController.ts
import { Request, Response } from "express";
import UserModel from "../schema/UserSchema"; // Adjust the path to your UserModel
import { deleteFileFromS3, getImageFromS3, getUserRelativeData, s3Uploader } from "../util/S3.util";
import ScheduleSchema from "../schema/ScheduleSchema";
import { IRelative, IUser } from "../interfaces/User.interfaces";
import ArchiveSchema from "../schema/ArchiveSchema";



// The addRelative controller assumes that checkFreeUserRelativeLimit middleware has already run.
export const createRelative = async (req: Request, res: Response) => {
  try {
    const { name, relation, email, contact } = req.body;
    
    // Validate required fields
    if (!name || !relation || !email || !contact) {
      res.status(400).json({
        success: false,
        message: "All fields (name, relation, email, contact) are required.",
      });
      return;
    }

    const user = await UserModel.findById(req.user?._id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found.",
      });
      return;
    }

    // Check if a relative with the same email or contact already exists
    const existingRelativeWithEmailOrContact = user.relative?.find(
      (rel) => rel.email === email || rel.contact == contact
    );
  
    if (existingRelativeWithEmailOrContact) {
      res.status(400).json({
        success: false,
        message: "A relative with the same email or contact already exists.",
      });
      return;
    }

    // Check if user is not premium and has 3 or more relatives
    if (!user.premium && (user.relative?.length || 0) >= 3) {
      res.status(403).json({
        success: false,
        message: "Free users can only add up to 3 relatives. Upgrade to Pro.",
      });
      return;
    }

    const relativeImage = req.file;
    let relativeImageData;

    if (relativeImage) {
      // Generate a unique relative ID for the folder structure
      const newRelativeId = new mongoose.Types.ObjectId().toString();
      const userId = req.user?._id?.toString();

      // Call s3Uploader with userId and relativeId, enforcing "avatar" folder
      const { succesResponse, error } = await s3Uploader(
        relativeImage,
        "test-after-life",
        userId,
        newRelativeId // Will be used as part of the folder structure
      );

      if (error) {
        res.status(500).json({
          success: false,
          message: `Error uploading image: ${error}`,
        });
        return;
      }

      relativeImageData = {
        Location: succesResponse?.Location,
        key: succesResponse?.Key,
        ETag: succesResponse?.ETag,
      };
    }

    // Add the new relative
    const newRelative = {
      name,
      relation,
      email,
      contact,
      relative_image: relativeImageData || {},
    };
    
    const updatedUserDoc = await UserModel.findByIdAndUpdate(
      req.user?._id,
      { $push: { relative: newRelative } },
      { new: true }
    ).lean();

    if (!updatedUserDoc) {
      res.status(404).json({
        success: false,
        message: "User not found after update.",
      });
      return;
    }

    // Find the newly added relative by contact
    const addedRelative = updatedUserDoc.relative?.find(
      (rel) => rel.contact == contact
    ) as IRelative;

    if (!addedRelative) {
      res.status(404).json({
        success: false,
        message: "Newly added relative not found.",
      });
      return;
    }

    const relativeImageBase64 = addedRelative.relative_image?.key 
      ? await getImageFromS3(addedRelative.relative_image.key, "test-after-life")
      : null;

    res.status(200).json({
      success: true,
      message: "Relative added successfully.",
      data: {
        ...addedRelative,
        relativeImage: relativeImageBase64,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "An unexpected error occurred.",
      error: (error as Error).message,
    });
  }
};


// Update an existing relative
export const updateRelative = async (req: Request, res: Response) => {
  try {
    const { name, relation, email, contact } = req.body;
    const relativeId = req.params.id; // Now getting from route params

    if (!relativeId) {
      res.status(400).json({
        success: false,
        message: "Relative ID is required.",
      });
      return;
    }

    const user = await UserModel.findById(req.user?._id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found.",
      });
      return;
    }

    const existingRelative = user.relative?.find((rel) => rel._id.toString() === relativeId);
    if (!existingRelative) {
      res.status(404).json({
        success: false,
        message: "Relative not found.",
      });
      return;
    }

    // Check if updating email or contact would conflict with another relative
    if (email !== existingRelative.email || contact !== existingRelative.contact) {
      const conflictingRelative = user.relative?.find(
        (rel) => (rel._id.toString() !== relativeId) && 
                (rel.email === email || rel.contact == contact)
      );

      if (conflictingRelative) {
        res.status(400).json({
          success: false,
          message: "Another relative already has this email or contact.",
        });
        return;
      }
    }

    // Process image upload if there is one
    const relativeImage = req.file;
    let relativeImageData;

    if (relativeImage) {
      const userId = req.user?._id?.toString();

      // Delete previous image if it exists
      if (existingRelative.relative_image?.key) {
        const deleteResult = await deleteFileFromS3(
          "test-after-life", 
          existingRelative.relative_image.key
        );
        
        if (deleteResult.error) {
          console.log("Warning: Failed to delete previous image:", deleteResult.error);
          // We continue despite failure to delete - logging the error but not failing the update
        } else {
          console.log("Previous image deleted successfully");
        }
      }

      // Call s3Uploader with userId and relativeId
      const { succesResponse, error } = await s3Uploader(
        relativeImage,
        "test-after-life",
        userId,
        relativeId
      );

      if (error) {
        res.status(500).json({
          success: false,
          message: `Error uploading image: ${error}`,
        });
        return;
      }

      relativeImageData = {
        Location: succesResponse?.Location,
        key: succesResponse?.Key,
        ETag: succesResponse?.ETag,
      };
      console.log("Uploaded Image Data:", relativeImageData);
    }

    // Update the relative's information
    const updateData: any = {
      "relative.$.name": name || existingRelative.name,
      "relative.$.relation": relation || existingRelative.relation,
      "relative.$.email": email || existingRelative.email,
      "relative.$.contact": contact || existingRelative.contact,
    };
    
    if (relativeImageData) {
      updateData["relative.$.relative_image"] = relativeImageData;
    }
    
    await UserModel.updateOne(
      { _id: req.user?._id, "relative._id": existingRelative._id },
      { $set: updateData }
    );

    // Fetch updated user data
    const updatedUser = await UserModel.findById(req.user?._id).lean();
    if (!updatedUser) {
      res.status(404).json({
        success: false,
        message: "User not found after update.",
      });
      return;
    }

    const updatedRelative = updatedUser.relative?.find(
      (rel) => rel._id.toString() === relativeId
    ) as IRelative;

    if (!updatedRelative) {
      res.status(404).json({
        success: false,
        message: "Updated relative not found.",
      });
      return;
    }

    const relativeImageBase64 = updatedRelative.relative_image?.key 
      ? await getImageFromS3(updatedRelative.relative_image.key, "test-after-life")
      : null;

    res.status(200).json({
      success: true,
      message: "Relative updated successfully.",
      data: {
        ...updatedRelative,
        relativeImage: relativeImageBase64,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "An unexpected error occurred.",
      error: (error as Error).message,
    });
  }
};



export const addContent = async (req: Request, res: Response) => {
  try {
    const { caption } = req.body
    const file = req.file;
    if (file) {
      const dataResponse = await s3Uploader(file as any, "test-after-life", req.user?._id as string, req.params.id as string);
      console.log(dataResponse.succesResponse)
      if (dataResponse.error) {
        res.status(500).json({
          success: false,
          message: dataResponse.error,
        })
        return
      }

      const result = await UserModel.findOneAndUpdate(
        {
          _id: req.user?._id,
          'relative._id': req.params.id,
        },
        {
          $set: {
            'relative.$.content': req.params.id,
          },
          $push: {
            'relative.$.captions': {
              key: dataResponse.succesResponse?.Key,
              caption,
            },
          },
        },
        { new: true } // Return the updated document
      ).lean()
      console.log(result)
      res.status(200).json({
        success: true,
        data: result,
      });
      return
    } else {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded.',
      }) as unknown as void;
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: (error as Error).message,
    });
    return
  }
}

export const getContent = async (req: Request, res: Response) => {
  try {
    const relativeData = await UserModel.findOne(
      {
        _id: req.user?._id,
        "relative._id": req.params.id,
      },
      { "relative.$": 1 }
    ).lean() as IUser

    if (!relativeData || !relativeData.relative || relativeData.relative.length === 0) {
      return res.status(404).json({
        success: false,
        message: "relative not found"
      }) as unknown as void
    }

    const relative = relativeData.relative[0];
    const data = await getUserRelativeData(relative._id.toString(), req.user?._id as string)
    return res.status(200).json({
      success: true,
      relative: {
        ...relative,
        contentData: data
      }
    }) as unknown as void

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: (error as Error).message,
    }) as unknown as void
  }
}

export const getAllRelatives = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const { type } = req.query

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found",
      }) as unknown as void
    }

    if (!user.relative?.length) {
      return res.status(200).json({
        success: true,
        relatives: [],
      }) as unknown as void
    }

    if (type === "setting") {
      return res.status(200).json({
        success: true,
        relatives: req.user?.relative,
      }) as unknown as void
    }
    // Map over relatives and fetch images concurrently
    const relativePromises = await user.relative.map(async (relative: any) => {
      const relativeImageBase64 = await getImageFromS3(relative.relative_image?.key, "test-after-life");
      return {
        ...relative.toObject(),
        relativeImage: relativeImageBase64, // Add base64 image to the relative object
      };
    });

    // Wait for all promises to resolve
    const relativesWithImages = await Promise.all(relativePromises);
    return res.status(200).json({
      success: true,
      relatives: relativesWithImages,
    }) as unknown as void

  } catch (error) {
    console.error("Error fetching relatives:", error);

    const message = (error as Error).message;
    return res.status(500).json({
      success: false,
      message,
    }) as unknown as void
  }
};

export const getRelativeById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // Ensure relatives is an array, default to empty array if undefined
    const relatives = req.user?.relative || [];
    // Find matching relative
    const relative = relatives.filter(rel => rel._id.toString() === id);
    
    if (relative.length > 0) {
      res.status(200).json({
        success: true,
        relative
      });
      return
    } else {
      // Send 404 if no relative found
      res.status(404).json({
        success: false,
        message: 'Relative not found'
      });
      return
    }
  } catch (error) {
    const message = (error as Error).message;
    res.status(500).json({
      success: false,
      message,
    });
    return
  }
};

export const deleteContent = async (req: Request, res: Response) => {
  try {
    const { key, relativeId } = req.query as { key: string, relativeId: string }
    const relative = req.user?.relative?.length ? req.user?.relative.filter((el) => el._id.toString() === relativeId) as IRelative[] : []
    if (relative.length > 0 && key) {
      let relative_id_from_key = key.split("/")[1]
      if (relative_id_from_key === relativeId) {
        const deleteResponse = await deleteFileFromS3("test-after-life", key as string)
        if (deleteResponse.error) {
          return res.status(400).json({
            success: false,
            message: deleteResponse.error
          }) as unknown as void
        }
        await UserModel.findOneAndUpdate({ _id: req.user?._id, "relative._id": relativeId }, {
          $pull: {
            "relative.$.captions": { key }
          }
        })
        return res.status(200).json({
          success: true,
          data: deleteResponse.data
        }) as unknown as void
      }
      else {
        return res.status(400).json({
          success: false,
          message: "this content is not related to you"
        }) as unknown as void
      }
    }
    else {
      return res.status(400).json({
        success: false,
        message: "bad request"
      }) as unknown as void
    }

  } catch (error) {
    const message = (error as Error).message
    return res.status(500).json({
      success: false,
      message,
    }) as unknown as void
  }
}

export const updateContent = async (req: Request, res: Response) => {
  try {
    const { caption } = req.body;
    const { relativeId, key } = req.query;
    const userId = req.user?._id;
    const file = req.file;

    // Debug logging
    console.log("Update request params:", { userId, relativeId, key, hasFile: !!file, caption });

    // First verify the user owns this relative
    const user = await UserModel.findOne(
      { _id: userId, "relative._id": relativeId },
      { "relative.$": 1 }
    );

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "This is not your relative"
      }) as unknown as void;
    }

    // File upload case - delete old file and upload new one
    if (file) {
      // Delete the existing file from S3
      const deleteResponse = await deleteFileFromS3("test-after-life", key as string);
      if (deleteResponse.error) {
        return res.status(400).json({
          success: false,
          message: deleteResponse.error
        }) as unknown as void;
      }

      // Remove the old caption entry
      await UserModel.findOneAndUpdate(
        { _id: userId, "relative._id": relativeId },
        { $pull: { "relative.$.captions": { key } } },
        { new: true }
      );

      // Upload the new file
      const dataResponse = await s3Uploader(file as any, "test-after-life", userId as string, relativeId as string);
      if (dataResponse.error) {
        return res.status(500).json({
          success: false,
          message: dataResponse.error
        }) as unknown as void;
      }

      // Add the new file and caption
      const updatedRelativeWithFile = await UserModel.findOneAndUpdate(
        {
          _id: userId,
          "relative._id": relativeId
        },
        {
          $push: {
            "relative.$.captions": { key: dataResponse.succesResponse?.Key, caption }
          }
        },
        { new: true }
      );

      return res.status(200).json({
        success: true,
        user: updatedRelativeWithFile
      }) as unknown as void;
    }

    // Caption update only case (no file)
    if (!file && caption) {
      console.log("Updating caption only:", { caption, key });

      // FIXED: Removed the relative.captions.key condition from the find criteria
      const updatedRelativeContentCaption = await UserModel.findOneAndUpdate(
        {
          _id: userId,
          "relative._id": relativeId
        },
        {
          $set: {
            "relative.$[rel].captions.$[cap].caption": caption
          }
        },
        {
          arrayFilters: [
            { "rel._id": relativeId },
            { "cap.key": key }
          ],
          new: true
        }
      );

      // Debug logging for the update result
      console.log("Update result:", updatedRelativeContentCaption ? "Document updated" : "No document found");

      if (!updatedRelativeContentCaption) {
        // If no document was updated, it might be because the key doesn't exist
        return res.status(404).json({
          success: false,
          message: "Caption not found with the provided key"
        }) as unknown as void;
      }

      return res.status(200).json({
        success: true,
        user: updatedRelativeContentCaption
      }) as unknown as void;
    }

    // If we reach here, neither file nor caption was provided
    return res.status(400).json({
      success: false,
      message: "Either file or caption is required"
    }) as unknown as void;

  } catch (error) {
    console.error("Error in updateContent:", error);
    return res.status(500).json({
      success: false,
      message: (error as Error).message,
    }) as unknown as void;
  }
};

export const fallBackResponded = async (req: Request, res: Response) => {
  try {
    const { userId, relativeId, notiId, platform } = req.query; // Get userId from query parameters
    const userQuery: any = { _id: userId };
    if (relativeId) {
      userQuery["relative._id"] = relativeId;
    }

    // Fetch the user
    const user = await UserModel.findOne(userQuery);
    if (!user) {
      res.status(404).json({ success: false, message: "User not found." });
      return
    }

    const notQuery: any = { user: user?._id };
    if (notiId) {
      notQuery["_id"] = notiId;
    }

    // Find and update the notification
    const notification = await ScheduleSchema.findOneAndUpdate(
      {
        ...notQuery,
        "platform.name": platform
      },
      {
        $set: {
          "platform.$[elem].status": "seen",
          "platform.$[elem].seen_on": Date.now()
        }
      },
      {
        arrayFilters: [{ "elem.name": platform }],
        new: true
      }
    );

    // If notification not found, return an error
    if (!notification) {
      res.status(404).json({ success: false, message: "Notification not found." });
      return
    }

    // Ensure notification.user is defined before creating ArchiveSchema
    if (!notification.user) {
      res.status(500).json({ success: false, message: "Notification user is missing." });
      return
    }

    // Archive the notification
    await ArchiveSchema.create({
      sent_date: notification.sent_date,
      content: notification.content,
      contentType: notification.contentType,
      platform: notification.platform,
      user: notification.user, // Ensure this field exists
      triggered_range: notification.triggered_range
    });

    // Delete the notification after archiving
    await ScheduleSchema.findByIdAndDelete(notification._id);

    // Render a simple HTML response
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Thank You</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                text-align: center;
                margin-top: 50px;
            }
        </style>
    </head>
    <body>
        <h1>Thank you for responding!</h1>
    </body>
    </html>
    `;
    res.send(html);
  } catch (error) {
    console.error("Error in fallBackResponded:", error);
    res.status(500).json({
      success: false,
      message: (error as Error).message
    });
    return
  }
};


import mongoose from "mongoose";

export const getContentForRelative = async (req: Request, res: Response) => {
  try {
    const { relativeId, userId } = req.query;
    console.log("Query Params:", req.query);

    // Convert relativeId to ObjectId
    const relativeObjectId = new mongoose.Types.ObjectId(relativeId as string);

    // Find the user and only return the matching relative
    const user = await UserModel.findOne(
      { _id: userId, "relative._id": relativeObjectId },
      { "relative.$": 1, name: 1, status: 1 } // Projection to return only matched relative
    ).lean() as IUser | null;

    if (!user || !user.relative?.length) {
      res.status(404).json({
        success: false,
        message: "User or relative not found",
      });
      return
    }

    const relative = user.relative[0]; // No need to filter manually
    const data = await getUserRelativeData(relativeId as string, userId as string);

    if (user.status === "expired" && relative.content_sent === true) {
      const relativeImageBase64 = await getImageFromS3(relative.relative_image?.key as string, "test-after-life");
      
      res.status(200).json({
        success: true,
        data: {
          user: user.name,
          relative: {
            relativeImageBase64,
            ...relative,
          },
          content: data,
        },
      });
      return
    }

    res.status(404).json({
      success: false,
      message: "Conditions not met for content retrieval",
    });
    return

  } catch (error) {
    console.error("Error in getContentForRelative:", error);
    res.status(500).json({
      success: false,
      message: (error as Error).message,
    });
    return
  }
};
